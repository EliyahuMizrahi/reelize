import { ScrollViewStyleReset } from 'expo-router/html';
import React, { PropsWithChildren } from 'react';

// Root HTML template for web. Injects global CSS that hides every native
// scrollbar (WebKit + Firefox + legacy IE/Edge) while keeping the scroll
// behaviour intact. The ScrollViewStyleReset comes from expo-router so
// RN ScrollViews get the correct base styles.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: HIDE_SCROLLBARS_CSS }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

const HIDE_SCROLLBARS_CSS = `
*::-webkit-scrollbar { width: 0 !important; height: 0 !important; background: transparent; }
* { scrollbar-width: none; -ms-overflow-style: none; }
html, body { overscroll-behavior: none; }
`;
