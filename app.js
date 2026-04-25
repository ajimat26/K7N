function buat(){

let nama=document.getElementById("nama").value;
let harga=document.getElementById("harga").value;
let status=document.getElementById("status").value;
let p=document.getElementById("produk").value;

if(!nama||!harga)return alert("Isi dulu!");

let namaProduk = (p==="custom"||p==="") ? "Custom" : produk[p].nama;
let id="K7N-"+Math.random().toString(36).substr(2,5);
let tanggal=new Date().toLocaleString("id-ID");

let obj={id,nama,layanan:namaProduk,harga,status,tanggal};
db.push(obj);
localStorage.setItem("k7n",JSON.stringify(db));

/* STRUK */
document.getElementById("hasil").innerHTML=`
<div id="strukBox" class="struk">
<img src="${logo}" class="logo">
<h3 style="text-align:center;">K7N STORE</h3>

<div class="line"></div>

<p>ID: ${id}</p>
<p>Nama: ${nama}</p>
<p>Layanan: ${namaProduk}</p>
<p>Tanggal: ${tanggal}</p>

<div class="line"></div>

<p>Harga: Rp ${Number(harga).toLocaleString("id-ID")}</p>

<div class="line"></div>

<p>Status: <span class="status ${status.toLowerCase()}">${status}</span></p>

<div class="line"></div>

<p style="text-align:center;">Terima kasih 🙏</p>
</div>

<button onclick="download()">📥 Download</button>
<button onclick='wa(${JSON.stringify(obj)})'>📤 WhatsApp</button>
`;
}
