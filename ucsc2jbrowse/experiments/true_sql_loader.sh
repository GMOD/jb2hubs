#!/bin/bash

parallel -j1 "$PARALLEL_OPTS" "hgsql dm6 < {}" ::: *.sql

time for i in *.txt.gz; do
  echo "$i"
  X=$(basename "$i" .txt.gz)
  pigz -dc "$i" | hgsql dm6 --local-infile=1 -e "LOAD DATA LOCAL INFILE '/dev/stdin' INTO TABLE $X;"
done
