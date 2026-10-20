// ═══════════════════════════════════════════════════════════════
// PROFILE CHART
// ═══════════════════════════════════════════════════════════════
function buildProfile(tk) {
  const canvas = document.getElementById('profileChart');
  const empty  = document.getElementById('pc-empty');
  if(tk.pts.length<3){ empty.textContent='Dados insuficientes'; return; }
  empty.style.display='none';
  canvas.style.display='block';
  if(profileChart){ profileChart.destroy(); profileChart=null; }

  const pts   = tk.pts;
  const tData = pts.map(p=>p.t);
  const iData = pts.map(p=>Math.round(p.ias));
  const aData = pts.map(p=>Math.round(p.alt));

  // X axis: distance to threshold (NM) for ARR/DEP, time for OVR
  const useDistX = (tk.type==='ARR' || tk.type==='DEP');
  const thr = tk.type==='ARR' ? THR20 : THR02;  // use RWY20 for ARR, RWY02 for DEP

  let xData, xLabel;
  if(useDistX) {
    xData  = pts.map(p=> +distNM(p.lat,p.lng,thr[0],thr[1]).toFixed(1));
    xLabel = tk.type==='ARR' ? '← distância ao THR20 (NM)' : 'distância ao THR02 (NM) →';
    // For ARR, invert so aircraft approaches from right to left (decreasing NM)
  } else {
    xData  = pts.map(p=>s2hm(p.t));
    xLabel = 'Tempo UTC';
  }

  const labs = useDistX ? xData.map(d=>`${d}NM`) : xData;

  const vtLinePlug = {
    id:'vtLine',
    afterDraw(chart) {
      if(chart.verticalLine===undefined) return;
      const t=chart.verticalLine;
      let idx=0;
      for(let i=0;i<tData.length;i++){ if(tData[i]<=t) idx=i; else break; }
      const x  = chart.scales.x.getPixelForValue(idx);
      const {top,bottom,left,right} = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();

      // Vertical line
      ctx.setLineDash([4,5]);
      ctx.strokeStyle='rgba(10,60,140,.85)';
      ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x,top); ctx.lineTo(x,bottom); ctx.stroke();
      ctx.setLineDash([]);

      // Current time label at top
      const timeLabel = s2hms(t);
      ctx.font='bold 10px Consolas,monospace';
      ctx.textAlign='center';
      const tw = ctx.measureText(timeLabel).width;
      const lx = Math.min(Math.max(x, left+tw/2+4), right-tw/2-4);
      ctx.fillStyle='rgba(255,255,255,.92)';
      ctx.fillRect(lx-tw/2-3, top-1, tw+6, 14);
      ctx.fillStyle='rgba(10,60,140,.9)';
      ctx.fillText(timeLabel, lx, top+10);

      // IAS value at IAS line intersection (left axis, blue)
      const iasVal  = iData[idx];
      const altVal  = aData[idx];
      const yIAS    = chart.scales.yL.getPixelForValue(iasVal);
      const yAlt    = chart.scales.yR.getPixelForValue(altVal);

      function drawTag(label, px, py, bgColor, textColor, anchor) {
        // anchor: 'left' draws tag to the right of x, 'right' draws to the left
        ctx.font='bold 10px Consolas,monospace';
        const tw2 = ctx.measureText(label).width;
        const pad=3, h=14;
        const bx = anchor==='left' ? px+5 : px-tw2-pad*2-5;
        const by = Math.min(Math.max(py-h/2, top), bottom-h);
        ctx.fillStyle=bgColor;
        ctx.beginPath();
        ctx.roundRect(bx, by, tw2+pad*2, h, 3);
        ctx.fill();
        ctx.fillStyle=textColor;
        ctx.textAlign='left';
        ctx.fillText(label, bx+pad, by+10);
      }

      // Check if IAS and Alt labels would overlap (within 16px vertically)
      // If so, offset one of them
      let yIASfinal = yIAS;
      let yAltfinal = yAlt;
      if(Math.abs(yIAS-yAlt) < 16) {
        // Push them apart by 8px each
        yIASfinal = yIAS < yAlt ? yIAS - 8 : yIAS + 8;
        yAltfinal = yAlt < yIAS ? yAlt - 8 : yAlt + 8;
      }

      // IAS tag — right side of line, blue
      drawTag(`${Math.round(iasVal)}kt`, x, yIASfinal, 'rgba(0,136,204,.15)', '#0055aa', 'left');
      // Alt tag — left side of line, orange
      const altLabel = altVal>=1800 ? `FL${String(Math.round(altVal/100)).padStart(3,'0')}` : `${Math.round(altVal)}ft`;
      drawTag(altLabel, x, yAltfinal, 'rgba(224,112,0,.13)', '#b05500', 'right');

      ctx.restore();
    }
  };

  profileChart = new Chart(canvas, {
    type:'line',
    plugins:[vtLinePlug],
    data:{
      labels:labs,
      datasets:[
        {label:'IAS (kt)', data:iData, borderColor:'#0088cc',
         backgroundColor:'rgba(0,136,204,.08)',borderWidth:2,
         pointRadius:0, yAxisID:'yL', tension:.2},
        {label:'Alt (ft)', data:aData, borderColor:'#e07000',
         borderDash:[6,4],borderWidth:2.5,
         pointRadius:0, yAxisID:'yR', tension:.2}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      interaction:{mode:'index',intersect:false},
      scales:{
        x:{display:true,
           ticks:{display:false},
           grid:{color:'rgba(0,0,0,.04)'},
           title:{display:useDistX,text:xLabel,color:'#8090a8',font:{size:9}}},
        yL:{position:'left',
            title:{display:true,text:'IAS kt',color:'#0088cc',font:{size:9}},
            ticks:{color:'#0088cc',font:{size:9}},
            grid:{color:'rgba(0,0,0,.05)'}},
        yR:{position:'right',
            title:{display:true,text:'Alt ft',color:'#e07000',font:{size:9}},
            ticks:{color:'#e07000',font:{size:9}},
            grid:{display:false}}
      },
      plugins:{
        legend:{labels:{color:'#4a6080',font:{size:10},boxWidth:14,padding:10}},
        tooltip:{backgroundColor:'rgba(20,30,50,.92)',titleColor:'#4af',
                 bodyColor:'#9ac',borderColor:'#c0d0e8',borderWidth:1}
      }
    }
  });
  profileChart.verticalLine=simT;
  profileChart.tData=tData;   // store for vtLine plugin
  profileChart.update('none');
}
