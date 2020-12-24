class ExtendableError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}

/**
 * RequestError: Axios請求失敗時，callApi回傳的物件
 */
export class RequestError {
  constructor({ error, config, response, isCancelled }) {
    this.error = error;
    this.config = config;
    this.response = response;
    this.isCancelled = isCancelled;
  }
}

/**
 * ServerNoResponseError 沒有收到伺服器的response
 * @class
 */
export class ServerNoResponseError extends ExtendableError {}

/**
 * NoAuthTokenError localStorage中並沒有發現token物件
 * @class
 */
export class NoAuthTokenError extends ExtendableError {}

/**
 * AuthTokenExpiredError 儲存於localStorage中的Token已經過期
 * @class
 */
export class AuthTokenExpiredError extends ExtendableError {}

/**
 * BEResponseError HTTP請求成功，但是後端回傳的payload中，status不為200或code不為CM000000
 * @class
 */
export class BEResponseError extends ExtendableError {}
