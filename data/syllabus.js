// data/syllabus.js
// Official NEET (UG) 2026 syllabus — NMC rationalized syllabus.
// Every chapter carries accurate NCERT class + chapter references.
// COVERAGE NOTE: question counts are computed live against the question pool;
// this file is the authoritative syllabus map, not a claim that questions exist for all.

const NEET_SYLLABUS = {
  PHYSICS: {
    label: 'Physics', totalUnits: 19,
    units: [
      { id:'PH01', name:'Units and Measurements',            cls:11, ncertCh:'1',  tids:['p1'] },
      { id:'PH02', name:'Kinematics (Motion in 1D & 2D)',    cls:11, ncertCh:'2-3',tids:['p2'] },
      { id:'PH03', name:'Laws of Motion',                    cls:11, ncertCh:'4',  tids:['p3'] },
      { id:'PH04', name:'Work, Energy and Power',            cls:11, ncertCh:'5',  tids:['p4'] },
      { id:'PH05', name:'System of Particles & Rotation',    cls:11, ncertCh:'6',  tids:['p5'] },
      { id:'PH06', name:'Gravitation',                       cls:11, ncertCh:'7',  tids:['p6'] },
      { id:'PH07', name:'Properties of Solids & Fluids',     cls:11, ncertCh:'8-9',tids:['p7'] },
      { id:'PH08', name:'Thermal Properties & Thermodynamics',cls:11,ncertCh:'10-11',tids:['p8'] },
      { id:'PH09', name:'Kinetic Theory of Gases',           cls:11, ncertCh:'12', tids:['p9'] },
      { id:'PH10', name:'Oscillations',                      cls:11, ncertCh:'13', tids:['p10'] },
      { id:'PH11', name:'Waves',                             cls:11, ncertCh:'14', tids:['p11'] },
      { id:'PH12', name:'Electrostatics',                    cls:12, ncertCh:'1-2',tids:['p12'] },
      { id:'PH13', name:'Current Electricity',               cls:12, ncertCh:'3',  tids:['p13'] },
      { id:'PH14', name:'Magnetic Effects & Magnetism',      cls:12, ncertCh:'4-5',tids:['p14'] },
      { id:'PH15', name:'EMI and Alternating Current',       cls:12, ncertCh:'6-7',tids:['p15'] },
      { id:'PH16', name:'Electromagnetic Waves',             cls:12, ncertCh:'8',  tids:['p16'] },
      { id:'PH17', name:'Optics (Ray & Wave)',               cls:12, ncertCh:'9-10',tids:['p17'] },
      { id:'PH18', name:'Dual Nature, Atoms and Nuclei',     cls:12, ncertCh:'11-13',tids:['p18'] },
      { id:'PH19', name:'Semiconductor Electronics',         cls:12, ncertCh:'14', tids:['p19'] },
    ],
  },
  CHEMISTRY: {
    label: 'Chemistry', totalUnits: 20,
    units: [
      { id:'CH01', name:'Some Basic Concepts of Chemistry',  cls:11, ncertCh:'1',  tids:['c1'] },
      { id:'CH02', name:'Structure of Atom',                 cls:11, ncertCh:'2',  tids:['c2'] },
      { id:'CH03', name:'Classification & Periodicity',      cls:11, ncertCh:'3',  tids:['c3'] },
      { id:'CH04', name:'Chemical Bonding',                  cls:11, ncertCh:'4',  tids:['c4'] },
      { id:'CH05', name:'Thermodynamics (Chem)',             cls:11, ncertCh:'5',  tids:['c5'] },
      { id:'CH06', name:'Equilibrium',                       cls:11, ncertCh:'6',  tids:['c6'] },
      { id:'CH07', name:'Redox Reactions',                   cls:11, ncertCh:'7',  tids:['c7'] },
      { id:'CH08', name:'Organic — Basic Principles',        cls:11, ncertCh:'8',  tids:['c8'] },
      { id:'CH09', name:'Hydrocarbons',                      cls:11, ncertCh:'9',  tids:['c9'] },
      { id:'CH10', name:'Solutions',                         cls:12, ncertCh:'1',  tids:['c10'] },
      { id:'CH11', name:'Electrochemistry',                  cls:12, ncertCh:'2',  tids:['c11'] },
      { id:'CH12', name:'Chemical Kinetics',                 cls:12, ncertCh:'3',  tids:['c12'] },
      { id:'CH13', name:'d- and f-Block Elements',           cls:12, ncertCh:'4',  tids:['c13'] },
      { id:'CH14', name:'Coordination Compounds',            cls:12, ncertCh:'5',  tids:['c14'] },
      { id:'CH15', name:'Haloalkanes and Haloarenes',        cls:12, ncertCh:'6',  tids:['c15'] },
      { id:'CH16', name:'Alcohols, Phenols and Ethers',      cls:12, ncertCh:'7',  tids:['c16'] },
      { id:'CH17', name:'Aldehydes, Ketones & Carboxylic Acids',cls:12,ncertCh:'8',tids:['c17'] },
      { id:'CH18', name:'Amines',                            cls:12, ncertCh:'9',  tids:['c18'] },
      { id:'CH19', name:'Biomolecules',                      cls:12, ncertCh:'10', tids:['c19'] },
      { id:'CH20', name:'Principles of Practical Chemistry', cls:12, ncertCh:'—',  tids:['c20'] },
    ],
  },
  BIOLOGY: {
    label: 'Biology', totalUnits: 10,
    units: [
      { id:'BI01', name:'Diversity in Living World',         cls:11, ncertCh:'1-4', tids:['b1'] },
      { id:'BI02', name:'Structural Organisation (Plants & Animals)', cls:11, ncertCh:'5-7', tids:['b2'] },
      { id:'BI03', name:'Cell Structure and Function',       cls:11, ncertCh:'8-10',tids:['b3'] },
      { id:'BI04', name:'Plant Physiology',                  cls:11, ncertCh:'11-13',tids:['b4'] },
      { id:'BI05', name:'Human Physiology',                  cls:11, ncertCh:'14-19',tids:['b5'] },
      { id:'BI06', name:'Reproduction',                      cls:12, ncertCh:'1-3', tids:['b6'] },
      { id:'BI07', name:'Genetics and Evolution',            cls:12, ncertCh:'4-6', tids:['b7'] },
      { id:'BI08', name:'Biology and Human Welfare',         cls:12, ncertCh:'7-8', tids:['b8'] },
      { id:'BI09', name:'Biotechnology and Applications',    cls:12, ncertCh:'9-10',tids:['b9'] },
      { id:'BI10', name:'Ecology and Environment',           cls:12, ncertCh:'11-13',tids:['b10'] },
    ],
  },
};

if (typeof module !== 'undefined') module.exports = { NEET_SYLLABUS };
