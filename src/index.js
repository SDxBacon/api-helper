import axios from 'axios';
import _pick from 'lodash/pick';
import { isReqSuccess } from '../responseHelper';
import { PATHS_WHITELIST } from './constants';
import {
  logDebug,
  isTokenExpired,
  getLocalStorageToken,
  displayFailNotification,
  displaySuccessNotification,
} from './utils';
import {
  RequestError,
  ServerNoResponseError,
  NoAuthTokenError,
  AuthTokenExpiredError,
  BEResponseError,
} from './classes/Exception';
import UnauthorizedManager from './classes/UnauthorizedManager';

export const instance = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

/**
 * AXIOS middleware for HTTP request
 */
instance.interceptors.request.use(
  (config) => {
    const { withoutAuth } = config;

    if (!withoutAuth) {
      // `config.withoutAuth`不為`true`，代表此Request需要帶token給後端。
      // 此處將從localStorage中取得token，並且在Request正式發出前，自動在HTTP request header
      // 中補上`Access-Token`欄位。若發生以下情況則拋出例外：
      //    1. 如果localStorage中不存在token物件，拋出`NoAuthTokenError`
      //    2. 如果token已經過期 (`tokenObject.expireAt`小於當前時間timestamp)，拋出`AuthTokenExpiredError`
      const tokenObject = getLocalStorageToken();

      if (tokenObject === null) {
        return Promise.reject({
          config,
          requestInterceptorError: new NoAuthTokenError('No access token'),
        });
      } else if (isTokenExpired(tokenObject)) {
        return Promise.reject({
          config,
          requestInterceptorError: new AuthTokenExpiredError(
            'Token is already expired'
          ),
        });
      }

      config.headers['Access-Token'] = tokenObject.token;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * AXIOS middleware for HTTP response
 */
instance.interceptors.response.use(
  /**
   * onFulfilled
   */
  (axiosResponse) => {
    const { config, data } = axiosResponse;
    if (data && isReqSuccess(data)) {
      return Promise.resolve(axiosResponse);
    }

    const { code, status, message } = data;
    if (!config.disableErrorNotification) {
      const notificationTitle = `错误 - ${status}`;
      const notificationContent = message || 'call api failed';
      displayFailNotification({
        title: notificationTitle,
        content: notificationContent,
      });
    }

    const errorMessage =
      message || `Server Error with code/status: ${code || status}`;
    const requestError = new RequestError({
      error: new BEResponseError(errorMessage),
      config,
      response: axiosResponse,
    });
    return Promise.reject(requestError);
  },
  /**
   * onReject
   */
  (error) => {
    // The request is been cancelled
    if (axios.isCancel(error)) {
      const requestError = new RequestError({
        config: error.config,
        isCancelled: true,
      });
      return Promise.reject(requestError);
    }
    // The request is marked as `authentication needed`, but there is not access-token been
    // stored in local storage. Force user to log out and reject the request
    else if (error.requestInterceptorError instanceof NoAuthTokenError) {
      // logout
      UnauthorizedManager.logout();

      // reject this request
      const requestError = new RequestError({
        error: error.requestInterceptorError,
        config: error.config,
        response: error.response,
      });
      return Promise.reject(requestError);
    }
    // The server responded with a status code 401 or `error.exception` is
    // an instance of AuthTokenExpiredError
    else if (
      error.response?.status === 401 ||
      error.requestInterceptorError instanceof AuthTokenExpiredError
    ) {
      if (error.config.retried) {
        // 如果已經是retried，還得到AuthTokenExpiredError或HTTP Status 401,
        // 強勢使用者登出。
        UnauthorizedManager.logout();
        const requestError = new RequestError({
          error: new AuthTokenExpiredError(
            'The request have been retried, but still receive unauthorized error'
          ),
          config: error.config,
          response: error.response,
        });
        return Promise.reject(requestError);
      }

      // waiting for token refreshing and retry
      return new Promise(async function (resolve, reject) {
        try {
          await UnauthorizedManager.refreshingToken();
          error.config.retried = true;
          resolve(instance(error.config));
        } catch (error) {
          const requestError = new RequestError({
            error,
            config: error.config,
            response: error.response,
          });
          reject(requestError);
        }
      });
    }
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    else if (error.response) {
      const requestError = new RequestError({
        error: new Error(
          'Server responded with a status code that is out of range of 2xx'
        ),
        config: error.config,
        response: error.response,
      });
      return Promise.reject(requestError);
    }
    // The request was made but no response was received
    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
    // http.ClientRequest in node.js
    else if (error.request) {
      const requestError = new RequestError({
        error: new ServerNoResponseError(),
        config: error.config,
      });
      return Promise.reject(requestError);
    }
    // Something happened in setting up the request that triggered an Error
    else {
      const requestError = new RequestError({
        error: new Error(error.message),
        config: error.config,
      });
      return Promise.reject(requestError);
    }
  }
);

/**
 * _callApi
 * @private
 */
function _callApi({ endpoint, method = 'get', body, ...configs }) {
  return instance({
    url: endpoint,
    method,
    data: body,
    ...configs,
  });
}

/**
 * callApi
 * @public
 * @param {RequestConfig} config
 * @return {Promise<CallApiResultObject|RequestError>} result
 */
export async function callApi(config) {
  try {
    const pickedConfig = _pick(config, PATHS_WHITELIST);
    const resp = await _callApi(pickedConfig);

    logDebug('[callApi] ... SUCCESS', resp);
    return resp.data;
  } catch (requestError) {
    logDebug('[callApi] ... FAIL');
    logDebug(requestError);

    return requestError;
  }
}

/**
 * callApiWithNotification 簡單的callApi小變型，主要幫忙做右下角顯示notification，顯示情境如下：
 *    1. Request成功，顯示`successNotificationInfo`中的內容
 *    2. Request失敗，且失敗的原因不是因為request被取消(isCancelled為false, null, undefined)，
 *       則顯示`rejectNotificationInfo`中的內容
 * @public
 * @param {RequestConfig} config
 * @param {Object} options
 * @param {NotificationInfo} options.onSuccess
 * @param {NotificationInfo} options.onFail
 * @return {Promise<CallApiResultObject|RequestError>} result
 */
export async function callApiWithNotification(config, options = {}) {
  const { onSuccess, onFail } = options;

  // 若disableErrorNotification沒有值，則使用是否有代入onFail做判斷。
  // 1. onFail -> Object
  //    disableErrorNotification -> true
  // 2. onFail -> null/undefined
  //    disableErrorNotification -> false
  config.disableErrorNotification = config.disableErrorNotification ?? !!onFail;

  try {
    // 挑出允許的參數
    const pickedConfig = _pick(config, PATHS_WHITELIST);

    // 執行callApi
    const resp = await _callApi(pickedConfig);

    // Request成功，若onSuccess有被代入，自動顯示`onSuccess`中的內容
    if (onSuccess) {
      displaySuccessNotification(onSuccess);
    }

    logDebug('[callApiWithNotification] ... SUCCESS', resp);
    return resp.data;
  } catch (requestError) {
    logDebug('[callApi] ... FAIL');
    logDebug(requestError);

    // Request失敗的原因不是因為HTTP Request被取消(isCancelled)，
    // 若onFail不為空，則顯示其內容
    if (!requestError.isCancelled && onFail) {
      displayFailNotification({
        mode: 'fail',
        content: requestError?.error?.message,
        ...onFail,
      });
    }

    return requestError;
  }
}

export default callApi;
