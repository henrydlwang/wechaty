/**
 * Wechat for Bot. Connecting ChatBots
 *
 * BrowserCookie
 *
 * ISSUE #59
 *
 * Licenst: ISC
 * https://github.com/zixia/wechaty
 *
 */
import * as fs from 'fs'
const arrify = require('arrify')

import Browser  from './browser'
import log      from '../brolog-env'

/**
 * DriverCookie type exits is because @types/selenium is not updated
 * with the latest 3.0 version of selenium. 201610 zixia
 */
export type CookieType = {
  [index: string]: string | number | boolean
  name: string
  value: string
  path: string
  domain: string
  secure: boolean
  expiry: number
}

export class BrowserCookie {
  constructor(private browser: Browser, private storeFile?: string) {
    log.verbose('PuppetWebBrowserCookie', 'constructor(%s, %s)'
                                        , browser.constructor.name
                                        , storeFile ? storeFile : ''
    )
  }

  public async read(): Promise<CookieType[]> {
    // just check cookies, no file operation
    log.verbose('PuppetWebBrowserCookie', 'checkSession()')

    if (this.browser.dead()) {
      throw new Error('checkSession() - browser dead')
    }

    // return new Promise((resolve, reject) => {
    try {
      // `as any as DriverCookie` because selenium-webdriver @types is outdated with 2.x, where we r using 3.0
      const cookies = await this.browser.driver().manage().getCookies() as any as CookieType[]
      log.silly('PuppetWebBrowserCookie', 'checkSession %s', cookies.map(c => c.name).join(','))
      return cookies
    } catch (e) {
      log.error('PuppetWebBrowserCookie', 'checkSession() getCookies() exception: %s', e && e.message || e)
      throw e
    }
  }

  public async clean(): Promise<void> {
    log.verbose('PuppetWebBrowserCookie', `cleanSession(${this.storeFile})`)
    if (!this.storeFile) {
      return
    }

    if (this.browser.dead())  { return Promise.reject(new Error('cleanSession() - browser dead'))}

    const filename = this.storeFile
    await new Promise((resolve, reject) => {
      fs.unlink(filename, err => {
        if (err && err.code !== 'ENOENT') {
          log.silly('PuppetWebBrowserCookie', 'cleanSession() unlink session file %s fail: %s', filename, err.message)
        }
        resolve()
      })
    })
    return
  }

  public async save(): Promise<void> {
    log.silly('PuppetWebBrowserCookie', `saveSession(${this.storeFile})`)
    if (!this.storeFile) {
      log.verbose('PuppetWebBrowserCookie', 'save() no session store file')
      return
    }
    const storeFile = this.storeFile

    if (this.browser.dead()) {
      throw new Error('saveSession() - browser dead')
    }

    const filename = this.storeFile

    function cookieFilter(cookies: CookieType[]) {
      const skipNames = [
        'ChromeDriver'
        , 'MM_WX_SOUND_STATE'
        , 'MM_WX_NOTIFY_STATE'
      ]
      const skipNamesRegex = new RegExp(skipNames.join('|'), 'i')
      return cookies.filter(c => {
        if (skipNamesRegex.test(c.name)) { return false }
        // else if (!/wx\.qq\.com/i.test(c.domain))  { return false }
        else                             { return true }
      })
    }

    try {
    // return new Promise((resolve, reject) => {
      // `as any as DriverCookie` because selenium-webdriver @types is outdated with 2.x, where we r using 3.0
      let cookies: CookieType[] = await this.browser.driver().manage().getCookies() as any as CookieType[]
      cookies = cookieFilter(cookies)
      // .then(cookies => {
        // log.silly('PuppetWeb', 'saving %d cookies for session: %s', cookies.length
        //   , util.inspect(cookies.map(c => { return {name: c.name /*, value: c.value, expiresType: typeof c.expires, expires: c.expires*/} })))
      log.silly('PuppetWebBrowserCookie', 'saving %d cookies for session: %s', cookies.length, cookies.map(c => c.name).join(','))

      const jsonStr = JSON.stringify(cookies)

      await new Promise((resolve, reject) => {
        fs.writeFile(storeFile, jsonStr, err => {
          if (err) {
            log.error('PuppetWebBrowserCookie', 'saveSession() fail to write file %s: %s', filename, err.errno)
            reject(err)
          }
          log.silly('PuppetWebBrowserCookie', 'saved session(%d cookies) to %s', cookies.length, filename)
          resolve(cookies)
        })
      })

    } catch (e) {
      log.error('PuppetWebBrowserCookie', 'saveSession() getCookies() exception: %s', e.message)
      throw e
    }
  }

  public async load(): Promise<void> {
    log.verbose('PuppetWebBrowserCookie', 'loadSession() from %s', this.storeFile ? this.storeFile : '' )

    if (!this.storeFile) {
      log.verbose('PuppetWebBrowserCookie', 'load() no session store file')
      return
    } else if (this.browser.dead()) {
      throw new Error('loadSession() - browser dead')
    }
    const storeFile = this.storeFile

    await new Promise((resolve, reject) => {
      fs.readFile(storeFile, (err, jsonStr) => {
        if (err) {
          if (err) { log.silly('PuppetWebBrowserCookie', 'loadSession(%s) skipped because error code: %s', this.storeFile, err.code) }
          return reject(new Error('error code:' + err.code))
        }
        const cookies = JSON.parse(jsonStr.toString())

        let ps = arrify(this.add(cookies))
        Promise.all(ps)
        .then(() => {
          log.verbose('PuppetWebBrowserCookie', 'loaded session(%d cookies) from %s', cookies.length, this.storeFile)
          resolve(cookies)
        })
        .catch(e => {
          log.error('PuppetWebBrowserCookie', 'loadSession() addCookies() exception: %s', e.message)
          reject(e)
        })
      })
    })
  }

  /**
   * only wrap addCookies for convinience
   *
   * use this.driver().manage() to call other functions like:
   * deleteCookie / getCookie / getCookies
   */
  // TypeScript Overloading: http://stackoverflow.com/a/21385587/1123955
  public async add(cookie: CookieType|CookieType[]): Promise<void> {
    if (this.browser.dead()) { return Promise.reject(new Error('addCookies() - browser dead'))}

    if (Array.isArray(cookie)) {
      for (let c of cookie) {
        await this.add(c)
      }
      return
    }
    /**
     * convert expiry from seconds to milliseconds. https://github.com/SeleniumHQ/selenium/issues/2245
     * with selenium-webdriver v2.53.2
     * NOTICE: the lastest branch of selenium-webdriver for js has changed the interface of addCookie:
     * https://github.com/SeleniumHQ/selenium/commit/02f407976ca1d516826990f11aca7de3c16ba576
     */
    // if (cookie.expiry) { cookie.expiry = cookie.expiry * 1000 /* XXX: be aware of new version of webdriver */}

    log.silly('PuppetWebBrowserCookie', 'addCookies(%s)', JSON.stringify(cookie))

    // return new Promise((resolve, reject) => {
    try {
      await (this.browser.driver().manage() as any).addCookie(cookie)
                  // this is old webdriver format
                  // .addCookie(cookie.name, cookie.value, cookie.path
                  //   , cookie.domain, cookie.secure, cookie.expiry)
                  // this is new webdriver format
    } catch (e) {
      log.warn('PuppetWebBrowserCookie', 'addCookies() exception: %s', e.message)
      throw e
    }
  }

}

export default BrowserCookie
