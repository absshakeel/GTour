import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadImage } from '../middleware/upload.middleware';
import { uploadSingleImage } from '../controllers/upload.controller';

const router: Router = Router();

/**
 * @openapi
 * /uploads/image:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload one image and get its public URL
 *     description: |
 *       `multipart/form-data` with the file in the `file` field. Images only,
 *       maximum 10 MB. The returned `url` is what the admin/provider forms store
 *       in their `images` arrays, so image links never have to be pasted by hand.
 *       The response is **not** wrapped in `data`.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Image stored.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 *       400:
 *         description: No file, or the file was rejected by the mime/size guard.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/image', authenticate, uploadImage.single('file'), uploadSingleImage);

export default router;
