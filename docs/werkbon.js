// Werkbon interieur: één A4-PDF per order voor het personeel van de interieurspecialist.
// Bevat: klant/order, pakket en uitvoering (kleur, stiksel, patroon), let-op, wijzigingen, de standaard
// werkinstructie per onderdeel (Scooterseats), referentiefoto's en een eindcontrole-blok.
// Nooit kenteken/meldcode op de werkbon (de interieurspecialist hoort die niet te zien).
(function(){
  'use strict';
  // Standaard werkinstructie per onderdeel (tekst van de interieurspecialist zelf)
  const WERK = {
    zitting: { kop: 'Interieurpakket 1 – zitting / rug', regels: [
      '2x zitting: 4 cm dik patroondeel, 1 cm grijs schuim; zijkanten 3 mm grijs.',
      '2x rug: 3 cm dik patroondeel, 1 cm grijs schuim; zijkanten 3 mm grijs.',
      'Polyprés op kunststof frames plakken; klaar in de kast.' ] },
    matten: { kop: 'Vloermatten', regels: [
      'Set: 1x bestuurder en 1x bijrijder.',
      'Beide mallen 1x per set snijden.',
      '3x strook van 140 cm (of rolbreedte) x 6 cm dik.' ] },
    deurpanelen: { kop: 'Deurpanelen – vervanger netje', regels: [
      'Beide maldelen 2x snijden.',
      '2x grijs schuim 3 mm: 2,5 x 80 cm.',
      '2x groen schuim 1 cm: 16 x 80 cm.',
      'Engelse naad op rechte deel, niet op deel met hoekje.',
      '2x kunststof deurpaneel met schuim in kast; rest bij machine.' ] },
    trekbanden: { kop: 'Lederen trekbanden deuren', regels: [
      '2x strook 4,8 x 25 cm snijden.',
      'Kunstleer: anti-rektape plakken; echt leer: niet.',
      'Goed plakken, zijkanten naar binnen vouwen.',
      '2x metalen vierkant met 2 gaten; met banden bij machine.' ] },
    deurschot: { kop: 'Pakket 2 – deurschot / patroon (zijpanelen)', regels: [
      'Topolino: 2x borduurmateriaal minimaal 145 x 85 cm.',
      'Rocks: 2x borduurmateriaal minimaal 180 x 90 cm.',
      'Onderkant aftekenen waar kunststof komt; materiaal en kunststof in kast.' ] },
    hoofdkussens: { kop: 'Pakket 3 – hoofdsteunkussens', regels: [
      '2x hoofdsteunkussen; mallen 2x snijden en alles op 1 cm grijs schuim stikken.',
      '2x zacht klittenband 8 x 10 cm.',
      '2x hard klittenband 5 x 10 cm.',
      '4 lagen groen schuim op elkaar plakken en uitsnijden met kleine vierkantje van gesneden mallen.',
      'Schuim in kast, rest bij machine.' ] },
    voorkap: { kop: 'Voorkap bekleden', regels: [
      '1x materiaal met 3 mm schuim: 27 x 100 cm; in kast.',
      '3 lagen materiaal op elkaar: mooie kant op mooie kant, lelijke kant op lelijke kant; boven en onder mooie kant zichtbaar.',
      'Beide mallen 2x op leer aftekenen.',
      'Gaten met holpijp Ø 2 mm; klaar bij machine.' ] },
    speakerbandjes: { kop: 'Extra – speakerbandjes', regels: [
      '2x strook 3,8 x 32 cm snijden.',
      'Echt leer: hele stuk schalmen.',
      'Goed inlijmen; eerst uiteinde 0,5 cm om, dan beide zijkanten naar binnen.',
      'Klaarleggen met 2x zwarte clip.' ] },
  };
  const PAKKET = { '1': ['zitting','matten','deurpanelen','trekbanden'], '2': ['zitting','matten','deurpanelen','trekbanden','deurschot'], '3': ['zitting','matten','deurpanelen','trekbanden','deurschot','hoofdkussens','voorkap'] };
  const ZOEK = [ [/speakerband/i,'speakerbandjes'], [/hoofdkussen|hoofdsteun/i,'hoofdkussens'], [/voorkap/i,'voorkap'], [/trekband|trektouw/i,'trekbanden'], [/vloermat|tapijt/i,'matten'], [/zijpane|zijkant|deurschot/i,'deurschot'], [/deurpane|netje|netten/i,'deurpanelen'], [/zitting|stoel/i,'zitting'] ];

  const MND=['jan','feb','mrt','apr','mei','jun','jul','aug','sept','okt','nov','dec'];
  const fmtD=iso=>{ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||''); return m?`${+m[3]} ${MND[+m[2]-1]} ${m[1]}`:''; };
  // jsPDF standaardfont kent alleen Latin-1: typografische tekens vervangen
  const asc=s=>String(s==null?'':s).replace(/[—–]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'...').replace(/•/g,'-').replace(/×/g,'x').replace(/[✓✔]/g,'v').replace(/[☐▢]/g,'[ ]').replace(/→/g,'->').replace(/[^\x00-\xff]/g,'?');

  function onderdelen(o){
    const int=((o.opdracht||{}).interieur||[]).join(' ');
    const alles=int+' '+((o.stappen||[]).filter(s=>s.wie==='Interieurspecialist').flatMap(s=>(s.items||[]).map(i=>i.tekst)).join(' '));
    let keys=o.pakket&&PAKKET[String(o.pakket)]?PAKKET[String(o.pakket)].slice():[];
    if(!keys.length){ const m=/pakket\s*([123])/i.exec(alles); if(m) keys=PAKKET[m[1]].slice(); }
    ZOEK.forEach(([re,k])=>{ if(re.test(alles)&&!keys.includes(k)) keys.push(k); });
    if(/geen voorkap|zonder voorkap/i.test(alles)) keys=keys.filter(k=>k!=='voorkap');
    return keys;
  }
  function uitvoering(o){ // kleur / stiksel / patroon uit de bestelregels halen
    const regels=((o.opdracht||{}).interieur||[]);
    return regels.length?regels:['(geen omschrijving)'];
  }
  async function laadPlaatje(f){
    try{
      if(f.data&&/^data:image/.test(f.data)) return f.data;
      const src=f.url||f.data; if(!src) return null;
      const r=await fetch(src); const b=await r.blob();
      return await new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=()=>res(null); fr.readAsDataURL(b); });
    }catch(e){ return null; }
  }
  function afmeting(dataUrl){ return new Promise(res=>{ const im=new Image(); im.onload=()=>res({w:im.naturalWidth,h:im.naturalHeight}); im.onerror=()=>res(null); im.src=dataUrl; }); }

  async function maak(o, photos, opties){
    const { jsPDF } = window.jspdf; const doc=new jsPDF({unit:'mm',format:'a4'});
    const W=210, L=14, R=196, BR=R-L; let y=16;
    const nieuwBlad=(nodig)=>{ if(y+nodig>282){ doc.addPage(); y=16; } };
    const kop=(t,size)=>{ doc.setFont('helvetica','bold'); doc.setFontSize(size||12); nieuwBlad(10); doc.text(asc(t),L,y); y+=size?size*0.5:6; };
    const tekst=(t,size,indent)=>{ doc.setFont('helvetica','normal'); doc.setFontSize(size||10); const lines=doc.splitTextToSize(asc(t),BR-(indent||0)); lines.forEach(ln=>{ nieuwBlad(5); doc.text(ln,L+(indent||0),y); y+=4.6; }); };
    const lijn=()=>{ nieuwBlad(4); doc.setDrawColor(180); doc.line(L,y,R,y); y+=4; };

    // Kop
    doc.setFillColor(17,17,17); doc.rect(0,0,W,22,'F'); doc.setTextColor(255);
    doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.text('WERKBON INTERIEUR',L,10);
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.text(asc(`Spéciale45  ·  order ${o.nummer}  ·  ${opties.datum}`),L,16.5);
    doc.setTextColor(0); y=30;
    const los=o.type==='los';
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.text(asc(o.klant||''),L,y); y+=7;
    const meta=[]; if(o.pakket) meta.push('Interieurpakket '+o.pakket); if(o.model&&!los&&!/losse/i.test(o.model)) meta.push(o.model);
    if(opties.deadline) meta.push((los?'klaar vóór ':'bij 1stop vóór ')+fmtD(opties.deadline));
    if(meta.length) tekst(meta.join('   ·   '),10.5);
    y+=2; lijn();

    kop('Uitvoering'); uitvoering(o).forEach(r=>tekst('• '+r,10.5,2));
    if(o.letopInterieur){ y+=1; doc.setFillColor(250,232,211); nieuwBlad(12); const lines=doc.splitTextToSize(asc('LET OP: '+o.letopInterieur),BR-4); doc.rect(L,y-4,BR,lines.length*4.6+4,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(10); lines.forEach(ln=>{ doc.text(ln,L+2,y); y+=4.6; }); y+=2; }
    const wijz=(o.wijzigingen||[]).filter(w=>!w.voor||w.voor.includes('Interieurspecialist'));
    if(wijz.length){ y+=1; kop('Wijzigingen',11); wijz.forEach(w=>tekst('• '+w.tekst,10,2)); }

    // Afvinklijst van de order
    const stap=(o.stappen||[]).find(s=>s.wie==='Interieurspecialist');
    if(stap&&(stap.items||[]).length){ y+=2; kop('Te maken (afvinklijst uit de app)'); stap.items.forEach(i=>{ nieuwBlad(6); doc.setDrawColor(60); doc.rect(L+1,y-3.4,3.6,3.6); doc.setFont('helvetica','normal'); doc.setFontSize(10); const lines=doc.splitTextToSize(asc(i.tekst),BR-8); lines.forEach((ln,k)=>{ if(k) nieuwBlad(5); doc.text(ln,L+7,y); y+=4.6; }); }); }

    // Standaard werkinstructie per onderdeel
    const keys=onderdelen(o);
    if(keys.length){ y+=3; lijn(); kop('Werkinstructie per onderdeel'); let n=0;
      keys.forEach(k=>{ const w=WERK[k]; if(!w) return; n++; y+=1.5; nieuwBlad(14); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.text(asc(String(n).padStart(2,'0')+'  '+w.kop),L,y); y+=5; w.regels.forEach(r=>tekst('– '+r,9.5,4)); });
    }

    // Referentiefoto's
    const refs=(photos||[]).filter(f=>f.stap==='ref'&&(!f.voor||f.voor==='alle'||f.voor==='Interieurspecialist'));
    if(refs.length){ y+=3; lijn(); kop("Referentiefoto's"); let x=L; const bw=56, gap=4; let rijH=0;
      for(const f of refs){ const d=await laadPlaatje(f); if(!d) continue; const dim=await afmeting(d); if(!dim) continue; const h=Math.min(bw*dim.h/dim.w,70); const w=h*dim.w/dim.h;
        if(x+w>R){ x=L; y+=rijH+9; rijH=0; } nieuwBlad(h+10); if(y+h>282){ doc.addPage(); y=16; x=L; rijH=0; }
        try{ doc.addImage(d,/png/i.test(d.slice(0,30))?'PNG':'JPEG',x,y,w,h); }catch(e){ continue; }
        doc.setFont('helvetica','normal'); doc.setFontSize(8); const cap=doc.splitTextToSize(asc(f.omschrijving||''),w); cap.slice(0,2).forEach((ln,k)=>doc.text(ln,x,y+h+3.5+k*3.4));
        rijH=Math.max(rijH,h+ (cap.length?7:2)); x+=w+gap; }
      y+=rijH+6; }

    // Eindcontrole
    y+=4; nieuwBlad(26); lijn(); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('EINDCONTROLE',L,y); y+=6;
    doc.setFont('helvetica','normal'); doc.setFontSize(10); let x=L;
    ['Aantallen / maten / materiaal','Kast of machine','Werkorder gereed'].forEach(t=>{ doc.rect(x,y-3.4,3.6,3.6); doc.text(asc(t),x+5.5,y); x+=doc.getTextWidth(asc(t))+14; });
    y+=10; doc.text('Medewerker: ______________________   Datum: ____________   Ordernummer: '+asc(o.nummer),L,y);
    // voettekst
    const pages=doc.getNumberOfPages(); for(let p=1;p<=pages;p++){ doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120); doc.text(asc(`Werkbon ${o.nummer} · ${o.klant||''} · blad ${p}/${pages}`),L,292); doc.setTextColor(0); }
    return doc;
  }

  // Delen (telefoon: deelmenu → WhatsApp/AirDrop) of downloaden
  window.werkbonInterieur = async function(o, photos, opties){
    if(!window.jspdf||!window.jspdf.jsPDF) throw new Error('PDF-bibliotheek niet geladen');
    const doc=await maak(o,photos,opties||{});
    const naam=`Werkbon_${o.nummer}_${String(o.klant||'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'')}.pdf`;
    const blob=doc.output('blob');
    try{ const file=new File([blob],naam,{type:'application/pdf'}); if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:naam}); return 'gedeeld'; } }catch(e){ if(e&&e.name==='AbortError') return 'geannuleerd'; }
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=naam; a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); },30000);
    return 'gedownload';
  };
})();
