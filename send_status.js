#!/usr/bin/env node
//call like node send_status.js, then enter STATUS content, then Ctrl+D (<<EOF>>)



var fs = require('fs');

var _ = require('underscore');

var Mastodon = require('mastodon-api');
const os = require('os');
const path = require('path');

const request = require('request');
var svg2png = require('svg2png');
var async = require('async');
var fs = require('fs');

_.mixin({
	guid : function(){
	  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
	    return v.toString(16);
	  });
	}
});


var send_status = function(status)
{

	var M = new Mastodon(
	{
		api_url:		`https://${process.env.INSTANCE_DOMAIN}/api/v1`
	  , access_token:		process.env.ACCESS_TOKEN
	}
	);

	recurse_retry(5, status, M);

}

var generate_svg = function(svg_text, description="", M, cb)
{
		let TMP_PATH = path.join(os.tmpdir(), `${_.guid()}.png`);
		svg2png(new Buffer(svg_text))
		.then(buffer=> fs.writeFileSync(TMP_PATH, buffer))
		.then( ()=> uploadMedia(fs.createReadStream(TMP_PATH), description, M, cb))
		.catch(e => cb(e));

}

var fetch_img = async function(url, description="", M, cb)
{
	uploadMedia(request(url), description, M, cb); //doesn't allow gifs/movies...or does it?
}

var uploadMedia = function(readStream, description="", M, cb)
{
	// M.post('/media', { file: readStream, description: description}, function (err, data, response) {
	M.post('/media', { file: readStream }, function (err, data, response) {
		if (err)
		{
			cb(err);
		}
		else
		{
			cb(null, data.id);
		}
	});
}

// this is much more complex than i thought it would be
// but this function will find our image tags 
// full credit to BooDooPerson - https://twitter.com/BooDooPerson/status/683450163608817664
// Reverse the string, check with our fucked up regex, return null or reverse matches back
var matchBrackets = function(text) {
  
  // simple utility function
  function reverseString(s) {
    return s.split('').reverse().join('');
  }

  // this is an inverstion of the natural order for this RegEx:
  var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

  text = reverseString(text);
  var matches = text.match(bracketsRe);
  if(matches === null) {
    return null;
  }
  else {
    return matches.map(reverseString).reverse();
  }
}


//see matchBrackets for why this is like this
function removeBrackets (text) {
  
  // simple utility function
  var reverseString = function(s) {
    return s.split('').reverse().join('');
  }

  // this is an inverstion of the natural order for this RegEx:
  var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

  text = reverseString(text);
  return reverseString(text.replace(bracketsRe, ""));
}


 var recurse_retry = function(tries_remaining, status, M)
{
	if (tries_remaining <= 0)
	{
		console.log("Out of retries, giving up");
		process.exit(1);
	}
	else
	{
		try
		{
			// console.log(status);
			var status_without_image = removeBrackets(status);
			var media_tags = matchBrackets(status);
			var cw_label = null;
			if (media_tags)
			{


				async.parallel(media_tags.map(function(match){
					
					var unescapeOpenBracket = /\\{/g;
					var unescapeCloseBracket = /\\}/g;
					match = match.replace(unescapeOpenBracket, "{");
					match = match.replace(unescapeCloseBracket, "}");


					if (match.indexOf("svg ") === 1)
					{
						return _.partial(generate_svg, match.substr(5,match.length - 6), null, M);
					}
					else if (match.indexOf("img ") === 1)
					{
						return _.partial(fetch_img, match.substr(5, match.length - 6), null, M);
					}
//					else if (match.indexOf("cut ") === 1)
//					{
//						cw_label = match.substr(5);
//					}
//					else if (match.indexOf("alt ") === 1)
//					{
//						// no-op
//						console.log(`alt text will be: ${match.substr(5, match.length - 6)}`);
//					}
					else
					{
						return function(cb){
							cb("error {" + match.substr(1,4) + "... not recognized");
						}
					}
				}),
				function(err, results)
				{
					if (err)
					{
						if (err['code'] == 89)  
				  		{
				  			console.log("Account permissions are invalid");
					  		process.exit(1);
				  		}
				  		else if (err['code'] == 226)  
				  		{
				  			console.log("Account has been flagged as a bot");
					  		process.exit(1);
				  		}
				  		else if (err['statusCode'] == 404)
				  		{

				  			console.log("Unknown (statusCode 404) error");
					  		process.exit(1);
				  			//unknown error
				  		}
				  		else
				  		{
				  			
							console.log("error generating SVG");
							console.log(err);
							recurse_retry(tries_remaining - 1, status, M);
							return;
				  		}

					}

		  			var params = { status: status_without_image, media_ids: results, sensitive: process.env.IS_SENSITIVE };
					if (cw_label !== null) { params['spoiler_text'] = cw_label; }
					M.post('/statuses', params, function(err, data, response) {
						if (err)
						{
						  	if (err["code"] == 186)
						  	{
						  		console.log("Tweet over 140 characters");
						  		process.exit(1);
						  	}
						  	else if (err['code'] == 187)
					  		{
					  			console.log("Tweet a duplicate");
						  		process.exit(1);
					  		}

						  	else if (err['code'] == 89)  
					  		{
					  			console.log("Account permissions are invalid");
						  		process.exit(1);
					  		}
					  		else if (err['code'] == 226)  
					  		{
					  			console.log("Account has been flagged as a bot");
						  		process.exit(1);
					  		}
					  		else if (err['statusCode'] == 404)
					  		{

					  			console.log("Unknown (statusCode 404) error");
						  		process.exit(1);
					  			//unknown error
					  		}
					  		else
					  		{
					  			console.error("mastodon returned error " + err['code'] + " " + JSON.stringify(err, null, 2));  
					  			console.log("mastodon returned error " + err['code'] + " : " + err['message']);  
					  			
						  		process.exit(1);
					  		}
						  	
						 
						}

					});
				});

			}
			else
			{
				let params = { status: status };
				if (cw_label !== null) { params['spoiler_text'] = cw_label; }
				M.post('/statuses', params, function(err, data, response) {
					if (err)
					{
					  	if (err["code"] == 186)
					  	{
					  		console.log("Tweet over 140 characters");
						  	process.exit(1);
					  	}
					  	else if (err['code'] == 187)
				  		{
				  			console.log("Tweet a duplicate");
						  	process.exit(1);
				  		}

					  	else if (err['code'] == 89)  
				  		{
				  			console.log("Account permissions are invalid");
						  	process.exit(1);
				  		}
				  		else if (err['code'] == 226)  
				  		{
				  			console.log("Account has been flagged as a bot");
						  	process.exit(1);
				  		}
				  		else if (err['statusCode'] == 404)
				  		{	
					  		console.log("Unknown (statusCode 404) error");
						  	process.exit(1);
				  			//unknown error
				  			
				  		}
				  		else
				  		{
				  			console.error("twitter returned error " + err['code'] + JSON.stringify(err, null, 2));  
					  		console.log("twitter returned error " + err['code'] + " : " + err['message']);  
				  			
						  	process.exit(1);
				  		}
					  	
					 
					}

				});
			}
		
			
		}
		catch (e)
		{
			if (tries_remaining <= 4)
			{
				console.log("error generating status (retrying)\nerror: " + e.stack);
			}
			recurse_retry(tries_remaining - 1, status, M);
		}
		
	}
	
};


send_status(fs.readFileSync('/dev/stdin').toString());

