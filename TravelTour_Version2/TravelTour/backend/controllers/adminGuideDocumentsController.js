import { createPartnerUser } from "../models/adminUsersModel.js";
import {
  buildGuideDocumentPublicUrl,
  getGuideDocuments,
  updateGuideDocuments,
} from "../models/guideDocumentsModel.js";
import {
  buildProviderDocumentPublicUrl,
  getProviderDocuments,
  updateProviderDocuments,
} from "../models/providerDocumentsModel.js";

function mapUploadedGuideFiles(files) {
  const contractFile = files?.contract?.[0];
  const cvFile = files?.cv?.[0];
  return {
    contract_file_url: contractFile
      ? buildGuideDocumentPublicUrl(contractFile.filename)
      : undefined,
    cv_file_url: cvFile ? buildGuideDocumentPublicUrl(cvFile.filename) : undefined,
  };
}

function mapUploadedProviderFiles(files) {
  const contractFile = files?.contract?.[0];
  const certificateFile = files?.certificate?.[0];
  return {
    contract_file_url: contractFile
      ? buildProviderDocumentPublicUrl(contractFile.filename)
      : undefined,
    certificate_file_url: certificateFile
      ? buildProviderDocumentPublicUrl(certificateFile.filename)
      : undefined,
  };
}

export async function postAdminPartnerUserController(req, res) {
  try {
    const role = String(req.body?.role || "").toLowerCase();
    const isGuide = role === "guide";
    const isProvider = role === "provider";

    if (isGuide) {
      const contractFile = req.files?.contract?.[0];
      const cvFile = req.files?.cv?.[0];
      if (!contractFile) {
        return res.status(400).json({
          message: "Vui lòng tải lên hợp đồng (file Word .doc hoặc .docx)",
        });
      }
      if (!cvFile) {
        return res.status(400).json({
          message: "Vui lòng tải lên CV (file PDF)",
        });
      }
    }

    if (isProvider) {
      const contractFile = req.files?.contract?.[0];
      const certificateFile = req.files?.certificate?.[0];
      if (!contractFile) {
        return res.status(400).json({
          message: "Vui lòng tải lên hợp đồng (file PDF)",
        });
      }
      if (!certificateFile) {
        return res.status(400).json({
          message: "Vui lòng tải lên giấy chứng nhận (file PDF)",
        });
      }
    }

    const created = await createPartnerUser({
      full_name: req.body?.full_name,
      email: req.body?.email,
      password: req.body?.password,
      role: req.body?.role,
      provider_id: req.body?.provider_id,
    });

    if (isGuide && created.guideId) {
      await updateGuideDocuments(created.guideId, mapUploadedGuideFiles(req.files));
    }

    if (isProvider && created.providerId) {
      await updateProviderDocuments(created.providerId, mapUploadedProviderFiles(req.files));
    }

    return res.status(201).json({
      message: "Tạo tài khoản đối tác thành công",
      data: created,
    });
  } catch (err) {
    console.error("❌ ADMIN CREATE PARTNER USER ERROR:", err);
    const status = Number(err?.statusCode || 500);
    return res.status(status).json({
      message: err.message || "Lỗi tạo tài khoản đối tác",
      error: err.sqlMessage || err.message,
    });
  }
}

export async function patchAdminGuideDocumentsController(req, res) {
  try {
    const guideId = Number(req.params.id);
    if (!guideId) {
      return res.status(400).json({ message: "ID hướng dẫn viên không hợp lệ" });
    }

    const contractFile = req.files?.contract?.[0];
    const cvFile = req.files?.cv?.[0];
    if (!contractFile && !cvFile) {
      return res.status(400).json({
        message: "Vui lòng chọn ít nhất một file (hợp đồng hoặc CV) để cập nhật",
      });
    }

    const payload = {};
    if (contractFile) {
      payload.contract_file_url = buildGuideDocumentPublicUrl(contractFile.filename);
    }
    if (cvFile) {
      payload.cv_file_url = buildGuideDocumentPublicUrl(cvFile.filename);
    }

    const updated = await updateGuideDocuments(guideId, payload);
    if (!updated) {
      return res.status(404).json({ message: "Không tìm thấy hướng dẫn viên" });
    }

    return res.status(200).json({
      message: "Đã cập nhật hồ sơ tài liệu HDV",
      data: updated,
    });
  } catch (err) {
    console.error("patchAdminGuideDocuments:", err);
    const status = Number(err?.statusCode || 500);
    return res.status(status).json({
      message: err.message || "Không cập nhật được tài liệu HDV",
    });
  }
}

export async function patchAdminProviderDocumentsController(req, res) {
  try {
    const providerId = Number(req.params.id);
    if (!providerId) {
      return res.status(400).json({ message: "ID nhà cung cấp không hợp lệ" });
    }

    const contractFile = req.files?.contract?.[0];
    const certificateFile = req.files?.certificate?.[0];
    if (!contractFile && !certificateFile) {
      return res.status(400).json({
        message: "Vui lòng chọn ít nhất một file (hợp đồng hoặc giấy chứng nhận) để cập nhật",
      });
    }

    const payload = {};
    if (contractFile) {
      payload.contract_file_url = buildProviderDocumentPublicUrl(contractFile.filename);
    }
    if (certificateFile) {
      payload.certificate_file_url = buildProviderDocumentPublicUrl(certificateFile.filename);
    }

    const updated = await updateProviderDocuments(providerId, payload);
    if (!updated) {
      return res.status(404).json({ message: "Không tìm thấy nhà cung cấp" });
    }

    return res.status(200).json({
      message: "Đã cập nhật hồ sơ tài liệu nhà cung cấp",
      data: updated,
    });
  } catch (err) {
    console.error("patchAdminProviderDocuments:", err);
    const status = Number(err?.statusCode || 500);
    return res.status(status).json({
      message: err.message || "Không cập nhật được tài liệu nhà cung cấp",
    });
  }
}

export async function getAdminGuideDocumentsController(req, res) {
  try {
    const guideId = Number(req.params.id);
    const data = await getGuideDocuments(guideId);
    if (!data) {
      return res.status(404).json({ message: "Không tìm thấy hướng dẫn viên" });
    }
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Lỗi tải tài liệu HDV" });
  }
}

export async function getAdminProviderDocumentsController(req, res) {
  try {
    const providerId = Number(req.params.id);
    const data = await getProviderDocuments(providerId);
    if (!data) {
      return res.status(404).json({ message: "Không tìm thấy nhà cung cấp" });
    }
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Lỗi tải tài liệu nhà cung cấp" });
  }
}
