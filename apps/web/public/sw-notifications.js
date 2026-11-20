// Carregado pelo service worker do Workbox (vite.config.ts → workbox.importScripts).
// Tocar na notificação "Mesa 5 · Pedido #12 pronto" abre o app do garçom na comanda.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/garcom'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith('/garcom') && 'focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
