import type { PublicAppConfig } from '../contracts/domain'

/**
 * Every runtime URL in the app is resolved through this single base path, so the
 * site works from `/` and from a `/aimaster/` sub-directory without code changes.
 * `pageDepth` is the relative path from the page to the site root
 * (`./` for index.html, `../` for demo/index.html).
 */
export function resolveSiteBase(pageDepth: string): string {
  const base = new URL(pageDepth, window.location.href)
  return base.href.endsWith('/') ? base.href : `${base.href}/`
}

export function createAppConfig(pageDepth: string): PublicAppConfig {
  const basePath = resolveSiteBase(pageDepth)
  return {
    schemaVersion: '1.0',
    mode: 'static-demo',
    basePath,
    contentBaseUrl: new URL('data/content/', basePath).href,
    mediaBaseUrl: new URL('media/', basePath).href,
    flags: {
      arbitraryTextSearch: false,
      userImageUpload: false,
      leadSubmission: false,
    },
  }
}
