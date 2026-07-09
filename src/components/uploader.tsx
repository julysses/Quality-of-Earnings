"use client";

// Drag-and-drop document intake: Uppy Dashboard + tus resumable uploads
// straight to Supabase Storage, then a server action registers, classifies,
// and ingests each file.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Uppy, { type Meta, type UppyFile } from "@uppy/core";
import Tus from "@uppy/tus";
import Dashboard from "@uppy/react/dashboard";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { documentUploadComplete } from "@/lib/server/actions";
import { Callout } from "./ui";

const SIX_MB = 6 * 1024 * 1024; // Supabase resumable uploads require 6MB chunks

export function Uploader({ orgId, engagementId }: { orgId: string; engagementId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState<string[]>([]);

  const uppy = useMemo(() => {
    return new Uppy<Meta, Record<string, never>>({
      restrictions: {
        maxFileSize: 100 * 1024 * 1024,
        allowedFileTypes: [
          ".csv", ".ofx", ".qfx", ".qbo", ".pdf", ".xlsx", ".xls", ".png", ".jpg", ".jpeg",
          // QuickBooks Desktop files are accepted so the upload can show
          // guidance instead of being silently rejected by the browser picker.
          ".qbb", ".qbw", ".qbm", ".qbx", ".qba",
        ],
      },
      autoProceed: true,
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let accessToken: string | null = null;

    supabase.auth.getSession().then(({ data }) => {
      accessToken = data.session?.access_token ?? null;
      uppy.use(Tus, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        chunkSize: SIX_MB,
        allowedMetaFields: ["bucketName", "objectName", "contentType", "cacheControl"],
        headers: {
          authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        },
      });
    });

    const onFileAdded = (file: UppyFile<Meta, Record<string, never>>) => {
      const documentId = crypto.randomUUID();
      uppy.setFileMeta(file.id, {
        documentId,
        bucketName: "documents",
        objectName: `${orgId}/${engagementId}/${documentId}/${file.name}`,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      });
    };

    const onSuccess = async (file: UppyFile<Meta, Record<string, never>> | undefined) => {
      if (!file) return;
      const result = await documentUploadComplete({
        documentId: String(file.meta.documentId),
        engagementId,
        fileName: file.name ?? "upload",
        storagePath: String(file.meta.objectName),
        mimeType: file.type ?? null,
        sizeBytes: file.size ?? null,
      });
      setNotes((n) => [...n, `${file.name}: ${result.message}`]);
      router.refresh();
    };

    uppy.on("file-added", onFileAdded);
    uppy.on("upload-success", onSuccess);
    return () => {
      uppy.off("file-added", onFileAdded);
      uppy.off("upload-success", onSuccess);
    };
  }, [uppy, orgId, engagementId, router]);

  return (
    <div className="space-y-3">
      <Dashboard
        uppy={uppy}
        height={260}
        note="Drag & drop bank statements (CSV/OFX/QFX), the monthly P&L (CSV), tax returns, agings — whole folders welcome. CSV and OFX parse instantly; PDFs are stored for evidence (PDF extraction ships in the next release)."
        proudlyDisplayPoweredByUppy={false}
      />
      {notes.length > 0 && (
        <Callout tone="info" title="Processing results">
          <ul className="list-disc pl-4">
            {notes.slice(-6).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}
