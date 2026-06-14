import { NextRequest, NextResponse } from "next/server";
import { query, initDatabase } from "@/lib/db";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    await initDatabase();
    const result = await query(
      "SELECT id, version, changelog, file_hash, is_active, created_at FROM software_releases ORDER BY created_at DESC"
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Releases GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar releases" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initDatabase();
    const formData = await request.formData();
    const version = formData.get("version") as string;
    const changelog = formData.get("changelog") as string;
    const file = formData.get("file") as File | null;

    if (!version || !file) {
      return NextResponse.json({ error: "Versao e arquivo obrigatorios" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const hash = crypto.createHash("sha512").update(buffer).digest("hex");

    let signature = "NO_SIGNATURE_KEY_CONFIGURED";
    const privateKeyPath = process.env.RSA_PRIVATE_KEY_PATH;
    if (privateKeyPath && fs.existsSync(privateKeyPath)) {
      const privateKey = fs.readFileSync(privateKeyPath, "utf-8");
      const sign = crypto.createSign("RSA-SHA512");
      sign.update(buffer);
      sign.end();
      signature = sign.sign(privateKey, "base64");
    }

    const releasesDir = process.env.RELEASES_DIR || path.join(process.cwd(), "releases");
    if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });

    const fileName = `AtendIA-Setup-${version}.exe`;
    const filePath = path.join(releasesDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const latestYml = `version: ${version}\nfiles:\n  - url: ${fileName}\n    sha512: ${hash}\n    signature: ${signature}\n    size: ${buffer.length}\nreleaseDate: '${new Date().toISOString()}'\nchangelog: |\n  ${changelog || "Sem notas de versao"}\n`;
    fs.writeFileSync(path.join(releasesDir, "latest.yml"), latestYml);

    await query(
      `INSERT INTO software_releases (version, changelog, file_path, file_hash, signature, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [version, changelog || "", filePath, hash, signature]
    );

    await query("UPDATE software_releases SET is_active = 0 WHERE version != ?", [version]);

    return NextResponse.json({ success: true, data: { version, hash, signature, fileName } }, { status: 201 });
  } catch (error) {
    console.error("Release POST error:", error);
    return NextResponse.json({ error: "Erro ao criar release" }, { status: 500 });
  }
}
