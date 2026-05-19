/** Nav + user mặc định; danh sách HDV lấy từ API (inline trong hdv.html). */
window.hdvData = {
  nav: [
    { label: "Tổng quan", href: "tongquan.html" },
    { label: "Quản lý người dùng", href: "qlinguoidung.html" },
    { label: "Quản lý nhà cung cấp tour", href: "qlinhacungcap.html" },
    { label: "Quản lý hướng dẫn viên", href: "hdv.html", active: true },
    { label: "Quản lý tour", href: "qlitour.html" },
    { label: "Quản lý booking", href: "qlibooking.html" },
    { label: "Quản lý đánh giá", href: "qlidanhgia.html" },
    { label: "Báo cáo & thống kê", href: "baocao.html" },
    { label: "Cài đặt hệ thống", href: "caidat.html" },
  ],
  user: { name: "Admin User", email: "admin@traveltour.vn", initials: "AD" },
  stats: [],
  guides: [],
  paging: { page: 1, totalPages: 1, pages: [1], text: "" },
};
