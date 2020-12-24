import uuid from "uuid/v1";
import { globalStore } from "index";
// import { addToNotification } from 'containers/App/actions';
import { DEBUG } from "./constants";

// dummy function
const addToNotification = () => {};

const _displayNotification = ({ mode, title, content }) => {
  globalStore.dispatch(
    addToNotification({
      id: uuid(),
      mode: mode,
      title,
      content,
    })
  );
};

/**
 * displayFailNotification
 * @param {Object} notificationInfo
 * @param {String} notificationInfo.title
 * @param {String} notificationInfo.content
 */
export const displayFailNotification = (notificationInfo) => {
  _displayNotification({
    mode: "fail",
    ...notificationInfo,
  });
};

/**
 * displaySuccessNotification
 * @param {Object} notificationInfo
 * @param {String} notificationInfo.title
 * @param {String} notificationInfo.content
 */
export const displaySuccessNotification = (notificationInfo) => {
  _displayNotification({
    ...notificationInfo,
  });
};

/**
 * logDebug 若`utils/constants.js`中的DEBUG為true，則開啟NewCallApi中的debug log資訊
 * @param {string}} message
 */
export function logDebug(message) {
  if (DEBUG) console.log(message);
}

/**
 * 登出 - 從localStorage中移除token物件，並將頁面導向 root page
 */
export function logout() {
  // 從localStorage中，移除token
  localStorage.removeItem("token");

  // 將頁面導向root page
  window.location.href = "/";
}

/**
 * Get access-token that stored at local storage
 * @return {object|null} token
 */
export const getLocalStorageToken = () => {
  try {
    const localStorageToken = localStorage.getItem("token");
    const parsedToken = JSON.parse(localStorageToken);
    // 依照前人的設計，token取出來應該可以正常被parse為一般javascript object
    if (typeof parsedToken === "object") return parsedToken;

    // 否則，就回傳null
    return null;
  } catch (_) {
    // 發生錯誤，回傳null
    return null;
  }
};

/**
 * isTokenExpired - 判斷localStorage的token物件是否已經過期
 * @param {object} tokenObject
 */
export const isTokenExpired = (tokenObject) => {
  const tokenExpiredAt = tokenObject?.expireAt ?? 0;
  return tokenExpiredAt < Date.now();
};
