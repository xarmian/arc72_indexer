#!/usr/bin/bash
get_token_mint_rounds() {
  cat ../data/voitest/tokens.json | jq '.tokens[].mintRound'
}
for mr in $( get_token_mint_rounds )
do
	(cd ..; npm run backend -- --block ${mr} --once)
done
