'use strict';

function createDocumentsController(documentsService) {
  return {
    async list(req, res) {
      try {
        const data = await documentsService.list({ citizenId: req.citizen.id });
        return res.status(200).json({ success: true, data, error: null });
      } catch (err) {
        console.error('[documents] Unexpected error:', err.message);
        return res.status(500).json({
          success: false,
          error: { code: 'INTERNAL', message: 'Something went wrong.' },
        });
      }
    },
  };
}

module.exports = { createDocumentsController };
