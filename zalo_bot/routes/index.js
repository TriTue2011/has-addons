import express from 'express';
const router = express.Router();

import routesUI from './ui.js';
import routesAPI from './api.js';

router.use('/', routesUI);
router.use('/api', routesAPI);

export default router;
