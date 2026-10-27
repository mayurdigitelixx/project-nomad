import { test } from '@japa/runner'
import KVStore from '#models/kv_store'
import {
  getAssistantName,
  invalidateAssistantNameCache,
} from '#services/assistant_name_cache'

test('assistant name is cached until a settings change invalidates it', async ({ assert }) => {
  const originalGetValue = KVStore.getValue
  let storedName = 'First assistant'
  let reads = 0
  KVStore.getValue = (async () => {
    reads++
    return storedName
  }) as typeof KVStore.getValue
  invalidateAssistantNameCache()

  try {
    assert.equal(await getAssistantName(), 'First assistant')
    storedName = 'Renamed assistant'
    assert.equal(await getAssistantName(), 'First assistant')
    assert.equal(reads, 1)

    invalidateAssistantNameCache()
    assert.equal(await getAssistantName(), 'Renamed assistant')
    assert.equal(reads, 2)

    storedName = '   '
    invalidateAssistantNameCache()
    assert.equal(await getAssistantName(), 'AI Assistant')
  } finally {
    KVStore.getValue = originalGetValue
    invalidateAssistantNameCache()
  }
})
