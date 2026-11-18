// Huong dan: thanh tren + muc luc tu dong (h2/h3) + bam anh de phong to. Dung chung moi trang.
(function () {
  var trang = [
    ["index.html", "Mục lục"], ["dat-hang.html", "Người đặt hàng"], ["duyet.html", "Người duyệt"],
    ["lanh-dao.html", "Lãnh đạo / quản lý"], ["kho.html", "Kho"], ["ke-toan.html", "Kế toán"], ["admin.html", "Admin"],
  ];
  var hien = location.pathname.split("/").pop() || "index.html";
  var top = document.createElement("header");
  top.className = "top";
  top.innerHTML = '<a class="ten" href="index.html">📘 Hướng dẫn EO Mua hàng</a><nav>' +
    trang.map(function (t) { return '<a href="' + t[0] + '"' + (t[0] === hien ? ' style="text-decoration:underline"' : "") + ">" + t[1] + "</a>"; }).join("") +
    '<a href="/" title="Mở app">↗ Mở app</a></nav>';
  document.body.prepend(top);
  var muc = document.querySelector("aside.muc");
  if (muc) {
    var html = "<b>Trong trang này</b>";
    document.querySelectorAll("main h2, main h3").forEach(function (h, i) {
      if (!h.id) h.id = "m" + i;
      html += '<a href="#' + h.id + '" style="padding-left:' + (h.tagName === "H3" ? 12 : 0) + 'px">' + h.textContent + "</a>";
    });
    muc.innerHTML = html;
  }
  var phong = document.createElement("div");
  phong.id = "phong";
  phong.innerHTML = "<img alt=''>";
  phong.onclick = function () { phong.style.display = "none"; };
  document.body.appendChild(phong);
  document.querySelectorAll("figure img").forEach(function (img) {
    img.loading = "lazy";
    img.onclick = function () { phong.firstChild.src = img.src; phong.style.display = "grid"; };
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") phong.style.display = "none"; });
})();
