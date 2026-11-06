# Measured build footprint

Measured locally with the same production Vite build, before and after making secondary routes lazy. Numbers are Vite's reported decimal kB, rounded to two decimals.

| JavaScript requested for the home entry | Before route splitting | After route splitting |
| --- | ---: | ---: |
| Entry file | 501.21 kB | 394.32 kB |
| Required shared preload | Included in entry | 50.42 kB |
| Total initial application JavaScript | 501.21 kB | 444.74 kB |
| Total gzip size | 132.57 kB | 120.83 kB |

Initial application JavaScript decreased approximately 11.3% uncompressed and 8.9% gzipped. Account, title, episode, people, auth and browse pages load their own chunks when visited. This trades smaller initial loading for additional requests on the first visit to each secondary route. Images, CSS and third-party Bootstrap resources are excluded from this table. The existing logo/background assets still total approximately 2.48 MB uncompressed; no image or end-user latency improvement is claimed.

These are actual build artifact measurements, not Lighthouse scores or production speed measurements. Browser/network/device conditions and production query latency were not benchmarked. The metadata proxy's bounded 15-minute cache and catalogue request coalescing should be measured on representative traffic before asserting a latency or database improvement.
