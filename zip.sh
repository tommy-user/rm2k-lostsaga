#!/bin/bash

DEST_DIR="$HOME/easyrpg-player-apps"

# Create the destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Define the name of the zip file
ZIP_FILE="rm2k-lostsaga.zip"

# Zip the contents of the source directory
zip -r "$DEST_DIR/$ZIP_FILE" ./rm2k-lostsaga/*

echo "Lostsaga game is zipped and moved to $DEST_DIR/$ZIP_FILE"
