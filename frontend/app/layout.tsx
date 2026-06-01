import React from 'react'
import Script from 'next/script'
import '../styles/globals.css'
import ClientLayout from './ClientLayout'

type Props = {
  children: React.ReactNode
}

const stripExtensionAttrs = `
(function() {
  var attrs = ['bis_skin_checked', 'bis_id', 'bis_use', '__processed_5c7e3a1e-1'];
  function strip(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll('[' + attrs.join('],[') + ']');
    for (var i = 0; i < nodes.length; i++) {
      for (var j = 0; j < attrs.length; j++) {
        nodes[i].removeAttribute(attrs[j]);
      }
    }
  }
  strip(document.documentElement);
  var obs = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      for (var k = 0; k < m.addedNodes.length; k++) {
        var n = m.addedNodes[k];
        if (n.nodeType === 1) {
          for (var j = 0; j < attrs.length; j++) {
            if (n.hasAttribute && n.hasAttribute(attrs[j])) {
              n.removeAttribute(attrs[j]);
            }
          }
          if (n.querySelectorAll) strip(n);
        }
      }
    }
  });
  if (document.documentElement) {
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
`

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Script
          id="strip-extension-attrs"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: stripExtensionAttrs }}
        />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
