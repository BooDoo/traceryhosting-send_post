# Support script for [traceryhosting-frontend](https://GitHub.com/BooDoo/traceryhosting-frontend)

### node script to post a status to Mastodon 
from instructions fed to it via `post.php` script in [traceryhosting-frontend](https://GitHub.com/BooDoo/traceryhosting-frontend).  

It is fed the `STATUS` itself, and an `$env` array containing `ACCESS_TOKEN`, `INSTANCE_DOMAIN` and `IS_SENSITIVE` values.
It also relies on the `traceryhosting` mysql table


# TODO:
  - [X] Remove references to twitter/tweet
  - [X] Replace media Buffers with ReadStreams (v1) for compatability with [mastodon-api](https://github.com/vanita5/mastodon-api)
  - [ ] Strip twitter error codes  
  - [ ] BUG: "Post!" button sets "null" as status text when media posted w/ no text given
  - [ ] Modernize to async to match [traceryhosting-backend](https://GitHub.com/BooDoo/traceryhosting-backend)  
  - [ ] Support {cut …} and {alt …} bracketcodes for content warning and media descriptions  
  - [ ] Integrate Raven/Sentry.io error reporting?  
  - [ ] Build tests (lol right)  
