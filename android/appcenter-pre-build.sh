#!/usr/bin/env bash

# Example: Change bundle name of an iOS app for non-production
if [ "$APPCENTER_BRANCH" != "main" ];
then
    npm i \
    npx ionic cap sync \
fi