import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

const subjects = createSubjects({
	user: object({
		id: string(),
	}),
});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Ping
		if (url.pathname === "/ping") {
			return new Response(
				JSON.stringify({ status: "ok", service: "openauth-worker" }),
				{ headers: { "content-type": "application/json" } },
			);
		}

		return issuer({
			// ⬇️ ESTO ES CLAVE
			issuer: "https://login-mpe.ryd-servicio.workers.dev",

			storage: CloudflareStorage({
				namespace: env.AUTH_STORAGE,
			}),

			subjects,

			// ⬇️ CLIENTE OAUTH (AHORA SÍ SE REGISTRA)
			clients: {
				"mpe-web": {
					redirect_uris: [
						"https://chiletelco.com/auth/callback.php",
					],
				},
			},

			providers: {
				password: PasswordProvider(
					PasswordUI({
						sendCode: async (email, code) => {
							console.log(`Sending code ${code} to ${email}`);
						},
						copy: {
							input_code: "Code (check Worker logs)",
						},
					}),
				),
			},

			success: async (ctx, value) => {
				return ctx.subject("user", {
					id: await getOrCreateUser(env, value.email),
				});
			},
		}).fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

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
