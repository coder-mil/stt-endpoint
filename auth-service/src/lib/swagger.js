'use strict';
/**
 * OpenAPI spec generated from JSDoc comments on route handlers.
 * Exposed at /docs (Swagger UI) and /openapi.json (raw).
 */
const swaggerJsdoc = require('swagger-jsdoc');

const spec = swaggerJsdoc({
  failOnErrors: false,
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'STT Auth API',
      version: '0.1.0',
      description:
        'Authentication + transcription gateway for the STT Endpoint service. ' +
        'Tokens (access/refresh) are delivered both as cookies (for the SPA) ' +
        'and as Authorization: Bearer headers (for API clients). ' +
        'CSRF protection uses the double-submit cookie pattern: header ' +
        'X-CSRF-Token must equal the csrf_token cookie on non-GET requests.',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' },
      },
    },
    tags: [
      { name: 'auth', description: 'Register, login, refresh, logout, me, password reset' },
      { name: 'transcriptions', description: 'User-scoped transcription history + proxy to STT' },
      { name: 'meta', description: 'Health and docs' },
    ],
  },
  apis: ['./src/routes/*.js'],
});

module.exports = spec;
