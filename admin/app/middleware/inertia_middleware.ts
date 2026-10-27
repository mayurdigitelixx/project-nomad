import { getAssistantName } from '#services/assistant_name_cache'
import { SystemService } from '#services/system_service'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { InferSharedProps } from '@adonisjs/inertia/types'
export default class InertiaMiddleware extends BaseInertiaMiddleware {
  share(_ctx: HttpContext) {
    return {
      appVersion: () => SystemService.getAppVersion(),
      environment: process.env.NODE_ENV || 'production',
      aiAssistantName: getAssistantName,
    }
  }
  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    try {
      return await next()
    } finally {
      this.dispose(ctx)
    }
  }
}
declare module '@adonisjs/inertia/types' {
  export interface SharedProps extends InferSharedProps<InertiaMiddleware> {}
}
