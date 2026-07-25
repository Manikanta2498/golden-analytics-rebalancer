import { parsePortfolioCsv } from "@/lib/domain/parseCsv";

export async function POST(request: Request) {
  let csvText: string;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const csv = (body as { csv?: unknown })?.csv;
    if (typeof csv !== "string") {
      return Response.json(
        { error: "Expected a `csv` string in the request body." },
        { status: 400 },
      );
    }
    csvText = csv;
  } else if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "Expected a `file` field containing the CSV export." },
        { status: 400 },
      );
    }
    csvText = await file.text();
  } else {
    csvText = await request.text();
  }

  if (csvText.trim() === "") {
    return Response.json({ error: "The CSV is empty." }, { status: 400 });
  }

  const result = parsePortfolioCsv(csvText);

  if (result.positions.length === 0) {
    return Response.json(
      {
        error:
          "No positions were found. Check that this is a broker positions export.",
        warnings: result.warnings,
      },
      { status: 422 },
    );
  }

  return Response.json(result);
}
