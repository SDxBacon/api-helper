// the flag to enable logging debug message of NewCallApi
export const DEBUG = false;

// A flag to override property `expireAt` after refreshing token api is called
export const DEBUG_TOKEN_EXPIRED_AFTER_10_SEC = false;

// The millisecond that UnauthorizedManager.logout can be triggered again
export const LOGOUT_LOCK_TIME = 1000;

// The url of the refresh token api
export const URL_REFRESH_TOKEN = `${process.env.REACT_APP_API_URL}/api/users/refresh/token`;

// The whitelist of paths while using callApi
export const PATHS_WHITELIST = [
  'endpoint',
  'method',
  'body',
  'cancelToken',
  'withoutAuth',
  'disableErrorNotification',
];
