export const APP_NAME = 'ReadyToWear';

// Private GitHub repo holding data.json and the photos. Leave empty to run in demo mode
// (data stays in this browser).
export const DATA_REPO = 'rubie-max/readytowear-data';
export const DATA_BRANCH = 'main';

// Sign-in accounts. Each one carries the repo access token encrypted with its own
// username + password, so the token can only be unlocked by signing in.
// Make new entries with tools/account.html.
export const ACCOUNTS = {
  kaizen: {
    name: 'Kaizen',
    salt: 'qpRc26dcOsS1SJYIMbS/Rw==',
    iv: 'Oi7rsbvGbFHxyO72',
    data: '+uByOn/pzJs9zdx14X/vnJey/8/6CcDRsWKwhCwIBBClc92XQS6p+aIWR2gGVfXKXMkVbB8nc5pVKMRQ1KWxTuPlwe+l9SF3prQz/RhegwmjPvj43GZCKpAPNb1NimkNA/6jWM7rPStObcxhYQ==',
  },
};
