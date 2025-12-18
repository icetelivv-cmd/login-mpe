import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

/**
 * =========================
 * SUBJECTS
 * =========================
 */
const subjects = createSubjects({
	user: object({
		id: string(),
	}),
});

/**
 * =========================
 * WORKER
 * =========================
 */
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		/**
		 * -------------------------
		 * PING (verificación simple)
		 * -------------------------
		 */
		if (url.pathname === "/ping") {
			return new Response(
				JSON.stringify({
					status: "ok",
					service: "openauth-worker",
				}),
				{ headers: { "content-type": "application/json" } },
			);
		}

		/**
		 * -------------------------
		 * OPENAUTH SERVER
		 * -------------------------
		 */
		return issuer({
			// Storage
			storage: CloudflareStorage({
				namespace: env.AUTH_STORAGE,
			}),

			// Subjects
			subjects,

			// 🔐 CLIENTES OAUTH (ESTO ES CLAVE)
			clients: {
				"mpe-web": {
					redirect_uris: [
						"https://chiletelco.com/auth/callback.php",
					],
				},
			},

			// Providers
			providers: {
				password: PasswordProvider(
					PasswordUI({
						sendCode: async (email, code) => {
							// En producción aquí envías el correo
							console.log(`Sending code ${code} to ${email}`);
						},
						copy: {
							input_code: "Code (check Worker logs)",
						},
					}),
				),
			},

			// UI Theme
			theme: {
				title: "myAuth",
				primary: "#0051c3",
				favicon: "https://workers.cloudflare.com/favicon.ico",
				logo: {
					dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
					light:
						"https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
				},
			},

			// Success
			success: async (ctx, value) => {
				return ctx.subject("user", {
					id: await getOrCreateUser(env, value.email),
				});
			},
		}).fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

/**
 * =========================
 * DB
 * =========================
 */
async function getOrCreateUser(env: Env, email: string): Promise<string> {
	const result = await env.AUTH_DB.prepare(
		`
		INSERT INTO user (email)
		VALUES (?)
		ON CONFLICT (email) DO UPDATE SET email = email
		RETURNING id;
		`,
	)
		.bind(email)
		.first<{ id: string }>();

	if (!result) {
		throw new Error(`Unable to process user: ${email}`);
	}

	return result.id;
}
