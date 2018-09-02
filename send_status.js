#!/usr/bin/env node
//call like node send_status.js, then enter STATUS content, then Ctrl+D (<<EOF>>)

var fs = require('fs');

var _ = require('lodash');

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

var generate_svg = async function(svg_text, description='', M)
{
		let TMP_PATH = path.join(os.tmpdir(), `${_.guid()}.png`);
		return svg2png(new Buffer(svg_text))
		.then(buffer=> fs.writeFileSync(TMP_PATH, buffer))
		.then( ()=> uploadMedia(fs.createReadStream(TMP_PATH), description, M));
}

var fetch_img = async function(url, description='', M)
{
	return uploadMedia(request(url), description, M); //doesn't allow gifs/movies...or does it?
}

var uploadMedia = function(readStream, description="", M)
{
	let params = {file: readStream};
	if ( !_.isEmpty(description) ) {
		params.description = description;
	}
	return M.post('/media', params).then(res=>res.data['id']);
}

var prepareTag = function(tag) {
	const knownTags = ["img", "svg", "cut", "alt", "hide", "show"];
	let match = tag.match(/^\{((?:img|svg|cut|alt) |hide|show)(.*)\}/);
	if ( match && match[1] && _.includes(knownTags, match[1].trim()) ) {
		let tagType = match[1].trim();
		let tagContent = match[2];

		const unescapeOpenBracket = /\\{/g;
		const unescapeCloseBracket = /\\}/g;
		tagContent = tagContent.replace(unescapeOpenBracket, "{");
		tagContent = tagContent.replace(unescapeCloseBracket, "}");

		toReturn = {};
		toReturn[tagType] = tagContent;
		return toReturn;

	} else {
		console.error(`No known action for ${tag.split(' ')[0]}, ignoring`);
	}
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
    return matches.map(reverseString).reverse().map(prepareTag);
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
		let status_without_meta = removeBrackets(status);

		let media_ids = [];
		let cw_label = null;
		let alt_tags = [];
		let hide_media = null;
		let show_media = null;
		let meta_tags = matchBrackets(status); // [{img: "https://imgur.com/123tgvd"}, {svg: "<svg>....</svg>"}, ...]

		if (!_.isEmpty(meta_tags)) {
			console.log("Processing meta_tags...");
			console.dir(meta_tags);
			cw_label = meta_tags.find(tag=>_(tag).keys().first() == "cut"); // we take the first CUT, or leave it undefined
			alt_tags = meta_tags.filter(tag=>_(tag).keys().first() == "alt"); // we take all ALT tags, in sequence
			hide_media = meta_tags.find(tagObject=>_.has(tagObject, "hide")); // undefined or [{"hide": ""...}]
			show_media = meta_tags.find(tagObject=>_.has(tagObject, "show"));
			let media = meta_tags.filter(tag=>_(["img","svg"]).includes(Object.keys(tag)[0])); // we take all IMG or SVG tags, in sequence

			if (hide_media && show_media) {
				hide_media = true; // both given explicitly, prefer to HIDE
				show_media = false;
			}
			else if (show_media) {
				hide_media = false;
			}
			else if (hide_media) {
				show_media = false;
			}
			else {
				// nether show nor hide given explicitly, look at standard inheritance
				hide_media = hide_media || process.env.IS_SENSITIVE;
				hide_media = hide_media || !_.isEmpty(cw_label);
			}

			if (!_.isEmpty(cw_label) ) { console.log(`Got CUT: ${cw_label}`); }
			if (!_.isEmpty(alt_tags) ) { console.log(`Got ALT: ${alt_tags.map(el=>el.alt).join(" ;;; \n")}`); }
			if (hide_media) { console.log(`Manually overriding and flagging media as sensitive`); }

			media_ids = _.map(media, (tagObject, index) => {
				let tagType, tagContent;
				[tagType, tagContent] = _.pairs(tagObject)[0];

				if (tagType == "img") {
					let description = alt_tags[_.min([index, alt_tags.length-1])]; // take matching index (or last) ALT tag
					if (_.has(description, "alt")) { description = description.alt; } // or fallback to undefined
					return fetch_img(tagContent, description, M);
				}
				else if (tagType == "svg") {
					let description = alt_tags[_.min([index, alt_tags.length-1])]; // take matching index (or last) ALT tag
					if (_.has(description, "alt")) { description = description.alt; } // or fallback to undefined
					return generate_svg(tagContent, description, M);
				}
			});
		} else {
			console.log("No meta_tags. Passing empty media_ids[]");
			media_ids = [];
		}

		return Promise.all(media_ids).then((ids) => {
			// Once we have all the media_ids generated
			let params = {status: status_without_meta};

			if (!_.isEmpty(ids)) {
				params.media_ids = ids
			}

			if (!_.isEmpty(cw_label)) {
				params.spoiler_text = cw_label['cut'];
			}

			params.sensitive = hide_media;

			console.log(`Going to post with:`);
			console.dir(params);

			return M.post('/statuses', params);
		}).catch(err => {
			if (err === undefined)
			{
				// placeholder for error parsing logic
				console.error("This should never happen. Call a priest.");
				return;
			}
			else
			{
				console.log("error during media_tag parsing/generation or posting status:");
				console.log(err);
				recurse_retry(tries_remaining - 1, status, M);
				return;
			}
		});
	}
};


send_status(fs.readFileSync('/dev/stdin').toString());

