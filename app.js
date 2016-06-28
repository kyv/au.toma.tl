#!/usr/bin/node
var _ = require('lodash');
var fs = require('fs');
var execFileSync = require('child_process').execFileSync;
var SpotifyWebApi = require('spotify-web-api-node');
var redis = require('redis');
var client = redis.createClient();

var clientId = '18d6ff030f994c19a87301b8e3c45ad7',
    clientSecret = '69d1bc143cb648a9b7850aabefbef88a';

// Create the api object with the credentials
var spotifyApi = new SpotifyWebApi({
  clientId : clientId,
  clientSecret : clientSecret
});

// Retrieve an access token.
spotifyApi.clientCredentialsGrant()
  .then(function(data) {
    // Save the access token so that it's used in future calls
    spotifyApi.setAccessToken(data.body['access_token']);
  }, function(err) {
        console.log('Something went wrong when retrieving an access token', err);
  })
  .then(function(){
    const current = mpdCurrentSong();
    const playlist = mpdPlaylist();
    var base = _.last(playlist);
    client.sadd(['recent', current[1]], function(err, reply) {
      //console.log('added: ', reply); // 3
    });

    client.ttl('recent', function(err, replay){
      if (err && err < 0 ) {
        client.expire('recent', 3600);
      }
    })

    let query = 'track:\"' + base.title + '\" artist:\"'+ base.artist +'\"'
    //console.log(query);
    spotifyApi.searchTracks(query)
      .then(function(data) {
        console.log('Search for ' + query );
        return returnDataFromSearch(data.body.tracks.items);
      })
      .then(function(data){
        //console.log(data);
        var un_queued = _.filter(data, function(object){
          return ( _.map(playlist, 'title').indexOf(object.name) < 0 )
        });
        //console.log(un_queued);
        if ( un_queued.length < 1 ) {
          console.log('no results, add from genre');
          client.quit();
          process.exit(1);
        }
        return un_queued.map(function(song){
          return song.id;
        });
      })
      .then(function(data){
        let seeds = _.take(data, 3);
        spotifyApi.getRecommendations({ seed_tracks: seeds.join() })
          .then(function(data) {
            let recomendations = returnDataFromSearch(data.body.tracks);
            recomendations.forEach(function(object){

              let file = mpdSearchSong({ artist: object.artists[0],
                      title: object.name });

              client.sismember([ 'recent', object.name ],
                function(err, reply) {
                  if (reply < 1 && file ) {
                    console.log('file: ', file);
                    client.sadd(['recent', object.name], function(err, reply) {
                      mpdAddSong(file.split('\n')[0]);
                    });
                  } else {
                    process.exit(1);
                  }
                  return client.quit()
              });
            })
          })
      })
  });

function mpdCurrentSong() {
  return execFileSync('/usr/bin/mpc', ['current', '-f', '%artist% - %title% - %album% - %genre%'], {encoding: 'utf8'})
    .split('-').map(function(string){
      return string.trim();
  });
}

function mpdPlaylist() {
  // return array of objects in current playlist
  let playlist = execFileSync('/usr/bin/mpc', ['playlist'], {encoding: 'utf8'}).split('\n');
  return  _.compact(playlist).map(function(line){

      let array = line.split('-').map(function(string){
        return string.trim()
      });

      return {
        artist: array[0],
        title: array[1].replace(/ *\([^)]*\) */g, "")
      }
  });
}

function mpdSearchGenre(string) {
  //console.log(args)
  let query = ['search', 'genre', string];
  let result = execFileSync('/usr/bin/mpc', query, {encoding: 'utf8'});
  if (result.split('\n') > 1 ) {
    return _.sample(result.split('\n'));
  }
  return result.trim('\n')
}

function mpdSearchSong(args) {
  //console.log(args)
  let query = ['search', 'artist', args.artist.trim(), 'title', args.title.trim()];
  let result = execFileSync('/usr/bin/mpc', query, {encoding: 'utf8'});
  if (result.split('\n') > 1 ) {
    return _.sample(result.split('\n').slice(0,-1));
  } else {
    return result.split('\n')[0]
  }
}

function mpdAddSong(file) {
  let args = ['add', file];
  //var escaped = shellescape(args);
  //console.log(escaped);
  return execFileSync('/usr/bin/mpc', args, {encoding: 'utf8'});
}
//var current = execFileSync('/usr/bin/mpc', ['current', '-f', '%artist% - %title% - %album%'], {encoding: 'utf8'})
//  .split('-').map(function(string){
//    return string.trim();
//});

// + 'album:\"' + current[2] +'\"';

function returnDataFromSearch(data) {
  return data.map(function(song){
    return {
      album: song.album.name,
      name: song.name,
      id: song.id,
      artists: song.artists.map(function(artist){
        return artist.name
      })
    }
  });
}
//api.getRecommendations({
//    min_energy : 0.4,
//    market : 'ES',
//    seed_tracks : [],
//    limit : 5,
//    min_popularity : 50
//  })
//  .then(function(data) {
//    should.exist(data.body.tracks);
//    done();
//  }, function(err) {
//    done(err);
//  });
//});
//
