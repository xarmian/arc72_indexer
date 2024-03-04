# 0.0.6 - 2024-03-3
* Fix mint-min-round and mint-max-round for /collections endpoint
* Add `includes` query parameter to /collections endpoint
  * Comma-separated list of additional values to include in the response object
  * Currently only supports `unique-owners`
  * i.e. /collections/?includes=unique-owners