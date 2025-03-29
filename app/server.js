import express from 'express';
import { DateTime } from 'luxon';
import snakecaseKeys from 'snakecase-keys';
import expressSession from 'express-session';
import { RedisStore } from 'connect-redis';
import Redis from 'ioredis';
import config from 'config';
import mysql from 'mysql2/promise';
import history from 'connect-history-api-fallback';
import chalk from 'chalk';
import consoleExpressRoutes from 'console-express-routes';

const app = express();
const router = express.Router();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
	res.error = (error, seed = null) => {
		console.error(
			JSON.stringify(
				{
					time: DateTime.now().toISO(),
					error: {
						message: error.message,
						stack: error.stack,
						status: error.status || null
					}
				},
				null
			)
		);

		if (error.status) res.status(error.status);
		if (!res.statusCode) res.status(500);

		const code = crypto
			.createHash('md5')
			.update([req.method.toUpperCase(), req.baseUrl, res.statusCode, seed || error.seed].join(':'))
			.digest('hex');

		const errorResBody = {
			statusCode: res.statusCode,
			code,
			path: `${req.method}:${req.originalUrl}`,
			message: error.message,
			errors: []
		};
		if (error.errors && Array.isArray(error.errors))
			error.errors.forEach((e) => {
				const messages = [];
				if (e.path) messages.push(e.path);
				messages.push(e.message);
				errorResBody.errors.push({ message: messages.join(' : ') });
			});
		if (!errorResBody.errors.length) errorResBody.errors.push({ message: error.message });

		res.json(snakecaseKeys(errorResBody));
	};
	next();
});

const redis = new Redis(config.get('redis.session'));
const store = new RedisStore({ client: redis });
app.use(
	expressSession({
		...config.get('session'),
		secret: process.env.COOKIE_SECRET || 'secret',
		store
	})
);

const mysqlClient = mysql.createPool(config.get('mysql'));

router.get('/', (req, res) => {
	res.json({
		message: 'API is running',
		version: '1.0.0'
	});
});
app.use('/api', router);

if (isProduction) {
	app.use(history());
	app.use(express.static('dist'));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	res.error(err);
});

app.listen(PORT, () => {
	console.log();
	console.log('  ♻️  Server running at:');
	console.log(`    - Local:   ${chalk.cyan(`http://localhost:${PORT}`)}`);
	console.log();
	consoleExpressRoutes(app);
});
