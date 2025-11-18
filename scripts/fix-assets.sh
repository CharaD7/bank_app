#!/bin/bash
echo "Sanitizing PNG assets..."
find assets -name "*.png" -exec mogrify -strip {} \;
