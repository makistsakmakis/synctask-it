import { PublicClientApplication } from '@azure/msal-browser'

export const CONFIGURED = Boolean(
  import.meta.env.VITE_ENTRA_CLIENT_ID && import.meta.env.VITE_ENTRA_TENANT_ID
)

const SCOPES = ['User.Read', 'Sites.ReadWrite.All']
let msal = null
let ready = null

function ensure() {
  if (!CONFIGURED) throw new Error('Entra ID is not configured yet.')
  if (!msal) {
    msal = new PublicClientApplication({
      auth: {
        clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    })
    ready = msal.initialize()
  }
  return ready
}

// ALWAYS use full-page redirect. No popups anywhere -> block_nested_popups
// can never occur, in any host (normal tab, Outlook, Teams, embedded webview).
export async function getAccount() {
  if (!CONFIGURED) return null
  await ensure()
  const result = await msal.handleRedirectPromise().catch(() => null)
  if (result?.account) msal.setActiveAccount(result.account)
  return msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
}

export async function signIn() {
  await ensure()
  await msal.loginRedirect({ scopes: SCOPES }) // page navigates away
  return null
}

export async function signOut() {
  await ensure()
  const account = await getAccount()
  await msal.logoutRedirect({ account })
}

// Token για το SharePoint REST API (τα συνημμένα των list items δεν εκτίθενται στο Graph)
const SP_HOST = import.meta.env.VITE_SP_HOSTNAME
export async function getSpToken() {
  await ensure()
  const account = await getAccount()
  if (!account) throw new Error('Not signed in')
  const scopes = [`https://${SP_HOST}/AllSites.Manage`]
  try {
    const res = await msal.acquireTokenSilent({ scopes, account })
    return res.accessToken
  } catch {
    await msal.acquireTokenRedirect({ scopes }) // page navigates away
    return null
  }
}

export async function getToken() {
  await ensure()
  const account = await getAccount()
  if (!account) throw new Error('Not signed in')
  try {
    const res = await msal.acquireTokenSilent({ scopes: SCOPES, account })
    return res.accessToken
  } catch {
    await msal.acquireTokenRedirect({ scopes: SCOPES }) // page navigates away
    return null
  }
}
