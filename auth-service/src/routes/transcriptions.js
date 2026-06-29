'use strict';
/**
 * Transcription routes — proxy to upstream STT service.
 * Provides audit trail, per-user quota, and CSRF-friendly API.
 */
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const { randomUUID } = require('crypto');

const prisma = require('../lib/prisma');
const env = require('../lib/env');
const log = require('../lib/log');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const { mintToken } = require('../middleware/csrf');

const router = express.Router();

// 25 MB cap, in-memory storage — files don't touch disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.rateLimit.max, fileSize: 25 * 1024 * 1024 },
});

const tLimiter = createRateLimiter({
  windowMin: 15,
  max: 60,
  routeName: 'transcribe',
});

// ------------------- POST /transcriptions -------------------
/**
 * @openapi
 * /api/transcriptions:
 *   post:
 *     tags: [transcriptions]
 *     summary: Upload an audio file and get it transcribed
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               audio: { type: string, format: binary }
 *               language: { type: string, example: pt }
 *     responses:
 *       201: { description: Transcribed. Returns jobId, text, language, duration. }
 *       502: { description: Upstream STT service unreachable. }
 *   get:
 *     tags: [transcriptions]
 *     summary: List the current user's transcriptions
 *     security: [{ cookieAuth: [] }]
 *     responses:
 *       200: { description: Array of items. }
 */
router.post(
  '/transcriptions',
  requireAuth,
  tLimiter,
  upload.single('audio'),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: 'no_audio', message: 'audio file required' });

    const localId = randomUUID();
    const language = (req.body && req.body.language) || 'pt';
    try {
      const fd = new FormData();
      fd.append('audio', req.file.buffer, {
        filename: req.file.originalname || 'audio.webm',
        contentType: req.file.mimetype || 'audio/webm',
      });
      if (language) fd.append('language', language);

      const upstream = await fetch(`${env.stt.endpoint}/v1/transcribe`, {
        method: 'POST',
        headers: {
          'X-API-Key': env.stt.apiKey,
          ...fd.getHeaders(),
        },
        body: fd.getBuffer(),
      });
      const body = await upstream.json().catch(() => ({}));

      const job = await prisma.transcriptionJob.create({
        data: {
          id: localId,
          userId: req.user.id,
          externalId: body && body.id ? String(body.id) : null,
          filename: req.file.originalname,
          bytes: req.file.size,
          language,
          status: upstream.ok ? 'done' : 'error',
          textPreview:
            (body && body.result && body.result.text)
              ? String(body.result.text).slice(0, 200)
              : null,
          finishedAt: new Date(),
        },
      });

      if (!upstream.ok) {
        log.warn('upstream_transcribe_failed', {
          userId: req.user.id,
          status: upstream.status,
        });
        return res.status(upstream.status).json({ error: 'upstream_failed', detail: body });
      }
      log.info('transcription_ok', { userId: req.user.id, jobId: job.id });
      return res.status(201).json({
        jobId: job.id,
        status: job.status,
        text: body.result?.text || '',
        language: body.result?.language,
        duration: body.result?.duration,
      });
    } catch (err) {
      log.error('transcription_exception', { error: err.message });
      return res.status(502).json({ error: 'upstream_unreachable' });
    }
  }
);

// ------------------- GET /transcriptions -------------------
router.get('/transcriptions', requireAuth, async (req, res) => {
  const items = await prisma.transcriptionJob.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      filename: true,
      status: true,
      language: true,
      bytes: true,
      textPreview: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  return res.json({ items });
});

// ------------------- GET /transcriptions/:id -------------------
/**
 * @openapi
 * /api/transcriptions/{id}:
 *   get:
 *     tags: [transcriptions]
 *     summary: Get one transcription
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Job. }
 *       404: { description: Not found. }
 *   delete:
 *     tags: [transcriptions]
 *     summary: Delete one transcription
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted. }
 */
router.get('/transcriptions/:id', requireAuth, async (req, res) => {
  const job = await prisma.transcriptionJob.findUnique({
    where: { id: req.params.id },
  });
  if (!job || job.userId !== req.user.id) {
    return res.status(404).json({ error: 'not_found' });
  }
  return res.json({ job });
});

// ------------------- DELETE /transcriptions/:id -------------------
router.delete('/transcriptions/:id', requireAuth, async (req, res) => {
  const job = await prisma.transcriptionJob.findUnique({
    where: { id: req.params.id },
  });
  if (!job || job.userId !== req.user.id) {
    return res.status(404).json({ error: 'not_found' });
  }
  await prisma.transcriptionJob.delete({ where: { id: job.id } });
  return res.status(204).end();
});

module.exports = router;
