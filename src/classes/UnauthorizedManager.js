import axios from 'axios';
import moment from 'moment';
import { isReqSuccess } from '../../responseHelper';
import { BEResponseError, NoAuthTokenError } from './Exception';
import {
  LOGOUT_LOCK_TIME,
  URL_REFRESH_TOKEN,
  DEBUG_TOKEN_EXPIRED_AFTER_10_SEC,
} from '../constants';
import { logout, logDebug, getLocalStorageToken } from '../utils';

class UnauthorizedManager {
  /**
   * #worker: refresh worker
   * @private
   */
  #worker;

  /**
   * #logoutTimeout: logout timer for disabling ripple effect
   * @private
   */
  #logoutTimeout;

  /**
   * #_refreshingToken: 實際執行refresh token的功能
   * @private
   * @returns {Promise} work
   */
  #_refreshingToken = async () => {
    // 由於refresh token需要local storage中的舊token資料，
    // 若local storage中不存在舊token，拋出NoAuthTokenError
    const tokenObj = getLocalStorageToken();
    if (tokenObj === null) {
      throw new NoAuthTokenError();
    }

    const { token, refreshToken } = tokenObj;
    const data = { refreshToken };
    const config = {
      headers: {
        'Access-Token': token,
      },
    };

    try {
      const response = await axios.post(URL_REFRESH_TOKEN, data, config);

      logDebug('[_refreshingToken] response:');
      logDebug(response);

      // 若 request 成功，更新localStorage中的token
      if (isReqSuccess(response.data)) {
        const { data } = response.data;

        // DEBUG: 強制覆寫token將於10秒後過期，已觸發快速token expired現象
        if (DEBUG_TOKEN_EXPIRED_AFTER_10_SEC) {
          data.expireAt = moment(Date.now()).add(10, 'seconds').valueOf();
        }

        localStorage.setItem('token', JSON.stringify(data));
        logDebug('[_refreshingToken] update token successfully.');
        return data;
      }

      throw new BEResponseError('Requesting refresh token fail');
    } catch (error) {
      logDebug('[_refreshingToken] error occurred!');
      logDebug(error);

      // 只要在refresh token時發生錯誤，無論錯誤是什麼類型，一併皆
      // 執行logout動作(迫使使用者登出、回到登入頁面)，並且將錯誤拋出
      this.logout();

      if (error instanceof BEResponseError) {
        // error是`BEResponseError`，代表成功與後端溝通，但是後端回傳刷新token失敗。
        throw error;
      } else if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        throw new Error(
          'Server responded with HTTP status code out of the range of 2xx'
        );
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error('No response was received');
      } else {
        // Something happened in setting up the request that triggered an Error
        throw error;
      }
    }
  };

  /**
   * UnauthorizedManager.logout: Logout delegate函式，主要是用於限制一秒內只執行一次登出動作。
   * 為了移除ripple effect。
   * @public
   */
  logout = () => {
    if (!this.#logoutTimeout) {
      this.#logoutTimeout = setTimeout(() => {
        this.#logoutTimeout = null;
      }, LOGOUT_LOCK_TIME);

      logout();
    }
  };

  /**
   * UnauthorizedManager.refreshingToken 執行refresh token
   * @public
   */
  refreshingToken = async () => {
    const tokenObj = getLocalStorageToken();

    // 如果localStorage中根就不存在token，拋出例外`NoAuthTokenError`
    if (tokenObj === null) {
      throw new NoAuthTokenError();
    }

    try {
      // 若#worker為nil, 代表目前並沒有在執行refresh token, 啟動worker
      if (!this.#worker) {
        logDebug(
          '[UnauthorizedManager] worker is idle, running #_refreshingToken.'
        );
        this.#worker = this.#_refreshingToken();
      }

      const nextTokenObj = await this.#worker;
      return nextTokenObj;
    } catch (error) {
      throw error;
    } finally {
      this.#worker = null;
    }
  };
}

const instance = new UnauthorizedManager();

export default instance;
