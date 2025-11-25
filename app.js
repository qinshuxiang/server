const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middlewares/errorMiddleware');
require('dotenv').config();

const routes = require('./src/routes');

const app = express();
app.use(morgan('combined', { stream: logger.stream }));
app.use(cors());
app.use(bodyParser.json());
app.use('/api', routes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`服务器运行在 http://localhost:${PORT}`);
    logger.info(`当前环境: ${process.env.NODE_ENV || 'development'}`);
});
