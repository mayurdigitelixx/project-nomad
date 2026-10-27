import KVStore from '#models/kv_store'

let assistantNameCache: { value: string; expiresAt: number } | null = null

export function invalidateAssistantNameCache() {
  assistantNameCache = null
}

export async function getAssistantName() {
  const now = Date.now()
  if (assistantNameCache && now < assistantNameCache.expiresAt) {
    return assistantNameCache.value
  }
  const customName = await KVStore.getValue('ai.assistantCustomName')
  const value = customName && customName.trim() ? customName : 'AI Assistant'
  assistantNameCache = { value, expiresAt: now + 60_000 }
  return value
}
