/**
 * Corre como script clásico en el <head>, antes del módulo React (deferred).
 * El host MCP Apps no envía tool-result hasta `ui/notifications/initialized`.
 * Si eso va en el useEffect, el mensaje ya pasó y la tarjeta se queda en Cargando.
 */
(function (w) {
  var PROTOCOL = "2026-01-26"
  var parentWin = w.parent
  var nextId = 1
  var pending = Object.create(null)
  var lastPayload = null
  var initializedSent = false
  var listeners = []

  function post(msg) {
    parentWin.postMessage(msg, "*")
  }

  function sendInitialized() {
    if (initializedSent) return
    initializedSent = true
    post({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} })
  }

  function emit(payload) {
    if (payload == null) return
    lastPayload = payload
    w.__WP_MCP_PAYLOAD = payload
    for (var i = 0; i < listeners.length; i++) listeners[i](payload)
    w.dispatchEvent(new CustomEvent("wp:mcp-payload", { detail: payload }))
  }

  function fromHost(event) {
    if (event.source && event.source !== parentWin) return false
    return true
  }

  w.addEventListener("message", function (event) {
    if (!fromHost(event)) return
    var message = event.data
    if (!message || message.jsonrpc !== "2.0") return

    if (message.method === "ui/initialize" && message.id !== undefined) {
      post({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: PROTOCOL } })
      sendInitialized()
      return
    }

    if (message.id !== undefined && pending[message.id]) {
      var waiter = pending[message.id]
      delete pending[message.id]
      if (message.error) waiter.reject(message.error)
      else waiter.resolve(message.result)
      return
    }

    if (message.method === "ui/notifications/tool-result") {
      var params = message.params
      var structured =
        params && typeof params === "object" && "structuredContent" in params
          ? params.structuredContent
          : params
      emit(structured)
    }
  })

  function request(method, params, timeoutMs) {
    var id = nextId++
    post({ jsonrpc: "2.0", id: id, method: method, params: params })
    return new Promise(function (resolve, reject) {
      var wait = timeoutMs == null ? 8000 : timeoutMs
      pending[id] = { resolve: resolve, reject: reject }
      setTimeout(function () {
        if (!pending[id]) return
        delete pending[id]
        reject(new Error("timeout"))
      }, wait)
    })
  }

  w.__WP_MCP_PAYLOAD = null
  w.__wpMcp = {
    getPayload: function () {
      return lastPayload
    },
    subscribe: function (fn) {
      listeners.push(fn)
      return function () {
        listeners = listeners.filter(function (x) {
          return x !== fn
        })
      }
    },
    request: request,
  }

  request(
    "ui/initialize",
    {
      protocolVersion: PROTOCOL,
      appCapabilities: { availableDisplayModes: ["inline"] },
    },
    400,
  ).then(sendInitialized, sendInitialized)

  w.addEventListener("openai:set_globals", function (event) {
    var detail = event.detail
    var out =
      detail && detail.globals && detail.globals.toolOutput != null
        ? detail.globals.toolOutput
        : w.openai && w.openai.toolOutput
    emit(out)
  })
})(window)
