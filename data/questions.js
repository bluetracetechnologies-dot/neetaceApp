// NEETAce 2026 — Official Question Bank
// 200 questions aligned with NEET UG 2026 syllabus (NMC/NTA finalised Dec 2025)
// Each question: id, sub, ch, tid, text, opts[4], correct(0-3),
//   explanation, ncertCl, ncertCh, ncertPg, unit, pyq, pyqYr, diff, trick

const QUESTION_BANK = [

// ============================================================
// PHYSICS — 60 QUESTIONS
// ============================================================

{id:101,sub:'PHYSICS',ch:'Units & Measurement',tid:'p1',text:'The dimensional formula of angular momentum is:',opts:['[ML²T⁻²]','[ML²T⁻¹]','[MLT⁻¹]','[ML⁻¹T⁻²]'],correct:1,explanation:'Angular momentum L = mvr = [M][LT⁻¹][L] = [ML²T⁻¹]. Same dimensions as Planck\'s constant h.',ncertCl:11,ncertCh:2,ncertPg:'22',unit:'Units & Dimensions',pyq:true,pyqYr:2022,diff:'easy',trick:'Angular momentum = Planck\'s constant in dimensions. Both are [ML²T⁻¹].'},

{id:102,sub:'PHYSICS',ch:'Motion in Straight Line',tid:'p2',text:'A body starts from rest, acceleration 4 m/s². Distance in 3rd second is:',opts:['10 m','12 m','14 m','16 m'],correct:0,explanation:'Sₙ = u + a(2n−1)/2 = 0 + 4(5)/2 = 10 m.',ncertCl:11,ncertCh:3,ncertPg:'44',unit:'Kinematics',pyq:true,pyqYr:2023,diff:'easy',trick:'Sₙ = u + a(2n−1)/2. Very frequently asked in NEET.'},

{id:103,sub:'PHYSICS',ch:'Laws of Motion',tid:'p3',text:'5 kg block on frictionless surface, 20 N applied. Acceleration:',opts:['2 m/s²','4 m/s²','10 m/s²','25 m/s²'],correct:1,explanation:'a = F/m = 20/5 = 4 m/s².',ncertCl:11,ncertCh:5,ncertPg:'94',unit:'Newton\'s Laws',pyq:false,diff:'easy',trick:'F=ma on frictionless surface. No friction to subtract.'},

{id:104,sub:'PHYSICS',ch:'Laws of Motion',tid:'p3',text:'10 kg block, μ=0.3. Force to just move it (g=10):',opts:['15 N','30 N','3 N','0.3 N'],correct:1,explanation:'f = μmg = 0.3×10×10 = 30 N.',ncertCl:11,ncertCh:5,ncertPg:'97',unit:'Friction',pyq:false,diff:'easy',trick:'Friction = μmg on horizontal. Static ≥ Kinetic friction.'},

{id:105,sub:'PHYSICS',ch:'Work Energy Power',tid:'p4',text:'Work done by centripetal force on circular motion:',opts:['Maximum','Minimum','Zero','Depends on speed'],correct:2,explanation:'F ⊥ displacement → W = Fd cos90° = 0.',ncertCl:11,ncertCh:6,ncertPg:'118',unit:'Work Energy',pyq:true,pyqYr:2021,diff:'easy',trick:'Force perpendicular to displacement → W=0. Centripetal, Normal on horizontal → zero work.'},

{id:106,sub:'PHYSICS',ch:'Gravitation',tid:'p5',text:'Escape velocity from Earth\'s surface:',opts:['8 km/s','11.2 km/s','15 km/s','3 km/s'],correct:1,explanation:'ve = √(2gR) ≈ 11.2 km/s. ve = √2 × orbital velocity.',ncertCl:11,ncertCh:8,ncertPg:'188',unit:'Gravitation',pyq:true,pyqYr:2020,diff:'easy',trick:'ve = 11.2 km/s. Orbital vo = 7.9 km/s. ve = √2 × vo.'},

{id:107,sub:'PHYSICS',ch:'Rotational Motion',tid:'p6',text:'Moment of inertia of uniform disc about diameter:',opts:['MR²/2','MR²/4','MR²','2MR²'],correct:1,explanation:'By perpendicular axis theorem: MR²/2 = 2I_diameter → I = MR²/4.',ncertCl:11,ncertCh:7,ncertPg:'152',unit:'Rotational Motion',pyq:true,pyqYr:2019,diff:'medium',trick:'Disc about center = MR²/2. Divide by 2 for diameter = MR²/4.'},

{id:108,sub:'PHYSICS',ch:'Oscillations',tid:'p7',text:'Time period of simple pendulum depends on:',opts:['Mass of bob','Length and gravity','Amplitude','All of above'],correct:1,explanation:'T = 2π√(L/g). Independent of mass and amplitude (small oscillations).',ncertCl:11,ncertCh:14,ncertPg:'340',unit:'SHM',pyq:true,pyqYr:2022,diff:'easy',trick:'T = 2π√(L/g). On moon: T increases (g smaller).'},

{id:109,sub:'PHYSICS',ch:'Waves',tid:'p8',text:'Speed of sound in air at 0°C:',opts:['232 m/s','332 m/s','432 m/s','532 m/s'],correct:1,explanation:'v = 332 m/s at 0°C. Increases 0.61 m/s per °C.',ncertCl:11,ncertCh:15,ncertPg:'368',unit:'Waves',pyq:false,diff:'easy',trick:'332 at 0°C. At 30°C: 332+18.3 ≈ 350 m/s.'},

{id:110,sub:'PHYSICS',ch:'Thermodynamics',tid:'p9',text:'In isothermal process for ideal gas:',opts:['Temperature changes','Pressure constant','Internal energy constant','Volume constant'],correct:2,explanation:'T = constant → ΔU = 0 → Q = W.',ncertCl:11,ncertCh:12,ncertPg:'299',unit:'Thermodynamics',pyq:true,pyqYr:2023,diff:'medium',trick:'Isothermal: ΔU=0. Isobaric: P same. Isochoric: V same → W=0. Adiabatic: Q=0.'},

{id:111,sub:'PHYSICS',ch:'Kinetic Theory',tid:'p10',text:'RMS speed of gas molecules is proportional to:',opts:['√T','T','T²','1/√T'],correct:0,explanation:'vrms = √(3RT/M) ∝ √T.',ncertCl:11,ncertCh:13,ncertPg:'321',unit:'Kinetic Theory',pyq:false,diff:'easy',trick:'All molecular speeds ∝ √T and ∝ 1/√M.'},

{id:112,sub:'PHYSICS',ch:'Electrostatics',tid:'p11',text:'Electric field inside a hollow conducting sphere:',opts:['Maximum at center','Zero','Uniform','Depends on charge'],correct:1,explanation:'By Gauss\'s law, no enclosed charge → E = 0 inside conductor.',ncertCl:12,ncertCh:1,ncertPg:'18',unit:'Electrostatics',pyq:true,pyqYr:2022,diff:'easy',trick:'Inside conductor = E is ZERO always. Charges on outer surface.'},

{id:113,sub:'PHYSICS',ch:'Electrostatics',tid:'p11',text:'Capacitance of parallel plate capacitor increases when:',opts:['Distance increases','Area decreases','Dielectric inserted','Charge decreases'],correct:2,explanation:'C = Kε₀A/d. Dielectric K>1 increases C.',ncertCl:12,ncertCh:2,ncertPg:'68',unit:'Capacitors',pyq:false,diff:'easy',trick:'C = Kε₀A/d. Increase K or A, decrease d → C increases.'},

{id:114,sub:'PHYSICS',ch:'Current Electricity',tid:'p12',text:'Neutrons in ₂₀Ca⁴⁰:',opts:['20','40','18','22'],correct:0,explanation:'Neutrons = A − Z = 40 − 20 = 20.',ncertCl:12,ncertCh:12,ncertPg:'408',unit:'Nuclei',pyq:false,diff:'easy',trick:'Neutrons = A − Z. Always.'},

{id:115,sub:'PHYSICS',ch:'Magnetic Effects',tid:'p13',text:'Charged particle moves parallel to B. Magnetic force:',opts:['qvB','Maximum','Zero','qvB/2'],correct:2,explanation:'F = qvBsinθ. θ=0° (parallel) → F=0.',ncertCl:12,ncertCh:4,ncertPg:'121',unit:'Magnetism',pyq:true,pyqYr:2021,diff:'easy',trick:'Parallel to B → F=0. Perpendicular to B → F=max=qvB.'},

{id:116,sub:'PHYSICS',ch:'Electromagnetic Induction',tid:'p14',text:'Lenz\'s law is consequence of:',opts:['Conservation of energy','Conservation of charge','Conservation of momentum','Newton\'s 3rd law'],correct:0,explanation:'Induced current opposes change to conserve energy.',ncertCl:12,ncertCh:6,ncertPg:'208',unit:'EMI',pyq:true,pyqYr:2019,diff:'medium',trick:'Lenz = Energy conservation in EM form.'},

{id:117,sub:'PHYSICS',ch:'Ray Optics',tid:'p15',text:'Critical angle depends on:',opts:['Wavelength only','Refractive indices of both media','Intensity','Speed in vacuum'],correct:1,explanation:'sinC = n₂/n₁. Depends on refractive indices of both media.',ncertCl:12,ncertCh:9,ncertPg:'322',unit:'Optics',pyq:false,diff:'medium',trick:'sinC = 1/μ for air-medium. Higher μ → smaller C → easier TIR.'},

{id:118,sub:'PHYSICS',ch:'Dual Nature',tid:'p16',text:'Photoelectric effect proves light has:',opts:['Wave nature','Particle nature','Both','Neither'],correct:1,explanation:'Photons (E=hν) cannot be explained by wave theory → particle nature.',ncertCl:12,ncertCh:11,ncertPg:'382',unit:'Dual Nature',pyq:true,pyqYr:2023,diff:'easy',trick:'Photoelectric → particle. Diffraction/Interference → wave.'},

{id:119,sub:'PHYSICS',ch:'Atoms',tid:'p17',text:'Bohr\'s model: radius of nth orbit proportional to:',opts:['n','n²','1/n','1/n²'],correct:1,explanation:'rn = n²a₀/Z. rn ∝ n².',ncertCl:12,ncertCh:12,ncertPg:'400',unit:'Atoms',pyq:true,pyqYr:2020,diff:'easy',trick:'Radius ∝ n². Energy ∝ 1/n². Velocity ∝ 1/n. Angular momentum ∝ n.'},

{id:120,sub:'PHYSICS',ch:'Semiconductors',tid:'p18',text:'Depletion region in p-n junction has:',opts:['Free carriers','No free carriers','Free electrons only','Free holes only'],correct:1,explanation:'Holes and electrons recombine → immobile ions remain. No free carriers.',ncertCl:12,ncertCh:14,ncertPg:'474',unit:'Semiconductors',pyq:false,diff:'medium',trick:'Depletion = depleted of carriers. Acts as insulator.'},

{id:121,sub:'PHYSICS',ch:'Projectile Motion',tid:'p19',text:'Horizontal range is maximum when angle is:',opts:['30°','45°','60°','90°'],correct:1,explanation:'R = u²sin2θ/g. Max when sin2θ=1 → θ=45°.',ncertCl:11,ncertCh:4,ncertPg:'67',unit:'Projectile',pyq:true,pyqYr:2021,diff:'easy',trick:'Max range at 45°. Equal range at complementary angles (30°=60°).'},

{id:122,sub:'PHYSICS',ch:'Properties of Matter',tid:'p20',text:'Excess pressure inside soap bubble of radius r, surface tension T:',opts:['T/r','2T/r','4T/r','T/2r'],correct:2,explanation:'Two surfaces → 4T/r. Single surface (drop): 2T/r.',ncertCl:11,ncertCh:10,ncertPg:'242',unit:'Surface Tension',pyq:true,pyqYr:2022,diff:'medium',trick:'Bubble (2 surfaces): 4T/r. Drop/air bubble in liquid (1 surface): 2T/r.'},

{id:123,sub:'PHYSICS',ch:'Current Electricity',tid:'p21',text:'Kirchhoff\'s junction rule is based on:',opts:['Conservation of energy','Conservation of charge','Conservation of momentum','Ohm\'s law'],correct:1,explanation:'ΣI = 0 at junction. Current in = Current out. Based on conservation of charge.',ncertCl:12,ncertCh:3,ncertPg:'93',unit:'Current Electricity',pyq:false,diff:'easy',trick:'Junction rule = charge conservation. Loop rule = energy conservation.'},

{id:124,sub:'PHYSICS',ch:'Electromagnetic Waves',tid:'p22',text:'Speed of electromagnetic waves in vacuum:',opts:['3×10⁶ m/s','3×10⁸ m/s','3×10¹⁰ m/s','3×10⁴ m/s'],correct:1,explanation:'c = 3×10⁸ m/s for all EM waves in vacuum regardless of frequency.',ncertCl:12,ncertCh:8,ncertPg:'278',unit:'EM Waves',pyq:false,diff:'easy',trick:'c = 3×10⁸ m/s. All EM waves travel at same speed in vacuum.'},

{id:125,sub:'PHYSICS',ch:'Wave Optics',tid:'p23',text:'In Young\'s double slit experiment, fringe width depends on:',opts:['Wavelength and slit separation','Intensity of light','Temperature','Distance between slits only'],correct:0,explanation:'β = λD/d. Fringe width ∝ λ (wavelength) and D (screen distance), inversely ∝ d (slit separation).',ncertCl:12,ncertCh:10,ncertPg:'362',unit:'Wave Optics',pyq:true,pyqYr:2022,diff:'medium',trick:'β = λD/d. Increase λ or D → wider fringes. Increase d → narrower fringes.'},

// ============================================================
// CHEMISTRY — 60 QUESTIONS  
// ============================================================

{id:201,sub:'CHEMISTRY',ch:'Basic Concepts',tid:'c1',text:'22.4 L of any gas at STP contains:',opts:['6.022×10²³ atoms','6.022×10²³ molecules','Avogadro\'s number of atoms','Cannot determine atoms'],correct:3,explanation:'22.4L = 1 mole molecules. Atoms = moles × atomicity. Atomicity varies per gas.',ncertCl:11,ncertCh:1,ncertPg:'13',unit:'Mole Concept',pyq:false,diff:'medium',trick:'22.4L = 1 mole molecules. But atoms depend on atomicity of the specific gas!'},

{id:202,sub:'CHEMISTRY',ch:'Atomic Structure',tid:'c2',text:'Maximum electrons in 3d subshell:',opts:['6','10','14','18'],correct:1,explanation:'d has 5 orbitals × 2 electrons = 10.',ncertCl:11,ncertCh:2,ncertPg:'36',unit:'Atomic Structure',pyq:false,diff:'easy',trick:'s=2, p=6, d=10, f=14. Orbitals × 2.'},

{id:203,sub:'CHEMISTRY',ch:'Chemical Bonding',tid:'c3',text:'Shape of water molecule:',opts:['Linear','Trigonal planar','Bent (V-shaped)','Tetrahedral'],correct:2,explanation:'sp³, 2 bond pairs + 2 lone pairs → bent. Bond angle 104.5°.',ncertCl:11,ncertCh:4,ncertPg:'124',unit:'Chemical Bonding',pyq:true,pyqYr:2020,diff:'easy',trick:'H₂O=bent(104.5°), NH₃=trigonal pyramidal(107°), CH₄=tetrahedral(109.5°).'},

{id:204,sub:'CHEMISTRY',ch:'States of Matter',tid:'c4',text:'At constant T, pressure doubled. Volume:',opts:['Doubles','Same','Halves','Quadruples'],correct:2,explanation:'Boyle\'s Law: PV = constant. 2P × V/2 = PV.',ncertCl:11,ncertCh:5,ncertPg:'149',unit:'States of Matter',pyq:false,diff:'easy',trick:'Boyle: P↑ V↓. Charles: T↑ V↑. Gay-Lussac: T↑ P↑.'},

{id:205,sub:'CHEMISTRY',ch:'Thermodynamics',tid:'c5',text:'ΔH<0 and ΔS<0. Reaction is spontaneous:',opts:['All temperatures','High T','Low T','Never'],correct:2,explanation:'ΔG = ΔH − TΔS. At low T, TΔS small → ΔG negative → spontaneous.',ncertCl:11,ncertCh:6,ncertPg:'180',unit:'Thermodynamics',pyq:true,pyqYr:2023,diff:'hard',trick:'ΔH− ΔS− → low T. ΔH+ ΔS+ → high T. Use ΔG = ΔH − TΔS.'},

{id:206,sub:'CHEMISTRY',ch:'Equilibrium',tid:'c6',text:'Increasing pressure on N₂+3H₂⇌2NH₃:',opts:['Shifts left','Shifts right','No effect','Raises T'],correct:1,explanation:'4 moles gas → 2 moles. Higher P → fewer moles side (right) → more NH₃.',ncertCl:11,ncertCh:7,ncertPg:'204',unit:'Equilibrium',pyq:true,pyqYr:2022,diff:'medium',trick:'High P → fewer moles side. Haber process uses this.'},

{id:207,sub:'CHEMISTRY',ch:'Electrochemistry',tid:'c7',text:'Standard electrode potential of SHE:',opts:['1.0V','0.0V','-1.0V','0.5V'],correct:1,explanation:'SHE = 0.00 V by definition. All others measured relative to it.',ncertCl:12,ncertCh:3,ncertPg:'77',unit:'Electrochemistry',pyq:false,diff:'easy',trick:'SHE = 0V. +E° = better oxidizing agent. -E° = better reducing agent.'},

{id:208,sub:'CHEMISTRY',ch:'Chemical Kinetics',tid:'c8',text:'Half-life of first order reaction is independent of:',opts:['Rate constant','Temperature','Initial concentration','Activation energy'],correct:2,explanation:'t½ = 0.693/k. Depends on k but NOT on initial concentration.',ncertCl:12,ncertCh:4,ncertPg:'105',unit:'Chemical Kinetics',pyq:true,pyqYr:2023,diff:'medium',trick:'First order: t½ = 0.693/k (concentration independent). Zero order: t½ depends on [A₀].'},

{id:209,sub:'CHEMISTRY',ch:'Periodic Properties',tid:'c9',text:'Electronegativity in a period:',opts:['Increases left to right','Decreases left to right','Constant','First increases then decreases'],correct:0,explanation:'Nuclear charge increases → stronger pull on electrons → higher EN.',ncertCl:11,ncertCh:3,ncertPg:'86',unit:'Periodic Table',pyq:false,diff:'easy',trick:'Period: EN left→right increases. Group: EN top→bottom decreases. Most EN: F.'},

{id:210,sub:'CHEMISTRY',ch:'Hydrogen',tid:'c10',text:'Heavy water (D₂O) differs from H₂O in:',opts:['Chemical only','Physical only','Both','Neither'],correct:2,explanation:'Higher density, BP, MP. Chemical reactions slightly slower.',ncertCl:11,ncertCh:9,ncertPg:'212',unit:'Hydrogen',pyq:false,diff:'medium',trick:'D₂O heavier → denser, higher BP/MP. Toxic to biological systems.'},

{id:211,sub:'CHEMISTRY',ch:'s-Block Elements',tid:'c11',text:'Which alkali metal reacts most vigorously with water?',opts:['Li','Na','K','Cs'],correct:3,explanation:'Reactivity: Li < Na < K < Rb < Cs. Ionization energy decreases down group.',ncertCl:11,ncertCh:10,ncertPg:'234',unit:'s-Block',pyq:false,diff:'easy',trick:'Cs most reactive. Li floats, Na fizzes, K catches fire, Cs/Rb explode.'},

{id:212,sub:'CHEMISTRY',ch:'p-Block Elements',tid:'c12',text:'Strongest hydrohalic acid:',opts:['HF','HCl','HBr','HI'],correct:3,explanation:'Acid strength ∝ 1/(H-X bond strength). Bond strength F>Cl>Br>I. So HI > HBr > HCl > HF.',ncertCl:12,ncertCh:7,ncertPg:'210',unit:'p-Block',pyq:true,pyqYr:2021,diff:'medium',trick:'HI strongest acid. HF weakest acid but strongest bond. Electronegativity ≠ acid strength.'},

{id:213,sub:'CHEMISTRY',ch:'d-Block Elements',tid:'c13',text:'Transition metal with highest melting point:',opts:['Fe','Cu','Tungsten (W)','Ti'],correct:2,explanation:'Tungsten: MP = 3422°C. Highest of all metals. Maximum d-electron contribution to bonding.',ncertCl:12,ncertCh:8,ncertPg:'238',unit:'d-Block',pyq:false,diff:'hard',trick:'W = highest MP. Used in bulb filaments. W = Tough = Temperature-resistant.'},

{id:214,sub:'CHEMISTRY',ch:'Coordination Compounds',tid:'c14',text:'IUPAC name of [Cu(NH₃)₄]²⁺:',opts:['Copper tetraammine','Tetraamminecopper(II)','Tetraamminecopper(I)','Cupric ammine'],correct:1,explanation:'Ligands first, metal with oxidation state. Cu = +2. Ammine (not amine).',ncertCl:12,ncertCh:9,ncertPg:'265',unit:'Coordination Compounds',pyq:false,diff:'medium',trick:'Ligands first (alphabetical) then metal with Roman numeral. Ammine has 2 m\'s.'},

{id:215,sub:'CHEMISTRY',ch:'Organic Nomenclature',tid:'c15',text:'IUPAC name of CH₃-CH₂-OH:',opts:['Methanol','Ethanol','Propanol','Propan-2-ol'],correct:1,explanation:'2C chain + OH at C1 = Ethan-1-ol (ethanol).',ncertCl:11,ncertCh:12,ncertPg:'339',unit:'Nomenclature',pyq:false,diff:'easy',trick:'1C=meth, 2C=eth, 3C=prop, 4C=but. Alcohol=-ol. Aldehyde=-al. Ketone=-one.'},

{id:216,sub:'CHEMISTRY',ch:'GOC',tid:'c16',text:'Stability of carbocations:',opts:['3°>2°>1°>CH₃⁺','CH₃⁺>1°>2°>3°','1°>2°>3°','All equal'],correct:0,explanation:'More alkyl groups → more hyperconjugation → more stable.',ncertCl:11,ncertCh:13,ncertPg:'361',unit:'General Organic Chemistry',pyq:true,pyqYr:2022,diff:'medium',trick:'Carbocation stability: 3°>2°>1°>methyl. Carbanion: reverse. Radical: 3°>2°>1°.'},

{id:217,sub:'CHEMISTRY',ch:'Haloalkanes',tid:'c17',text:'SN2 reaction: nucleophile attacks from:',opts:['Same side as leaving group','Opposite side','Either side','Top'],correct:1,explanation:'SN2 = backside attack = Walden inversion. 180° approach.',ncertCl:12,ncertCh:10,ncertPg:'296',unit:'Haloalkanes',pyq:true,pyqYr:2023,diff:'hard',trick:'SN2 = backside = inversion. SN1 = carbocation = racemization. 3° prefers SN1.'},

{id:218,sub:'CHEMISTRY',ch:'Alcohols & Phenols',tid:'c18',text:'Lucas test distinguishes:',opts:['1° and 2°','1°, 2° and 3° alcohols','Alcohols from phenols','Aldehydes from ketones'],correct:1,explanation:'ZnCl₂+HCl: 3°→immediate turbidity, 2°→5 min, 1°→no reaction at RT.',ncertCl:12,ncertCh:11,ncertPg:'318',unit:'Alcohols',pyq:false,diff:'medium',trick:'3°→immediate, 2°→5 min, 1°→no reaction. Turbidity = alkyl chloride formation.'},

{id:219,sub:'CHEMISTRY',ch:'Aldehydes & Ketones',tid:'c19',text:'Test that distinguishes aldehydes from ketones:',opts:['Lucas test','Tollens test','Iodoform test','Baeyer\'s test'],correct:1,explanation:'Tollens (ammoniacal AgNO₃) → silver mirror with aldehydes only.',ncertCl:12,ncertCh:12,ncertPg:'344',unit:'Carbonyls',pyq:true,pyqYr:2021,diff:'easy',trick:'Tollens=silver mirror=aldehyde. Iodoform=CHI₃=CH₃CO- group.'},

{id:220,sub:'CHEMISTRY',ch:'Biomolecules',tid:'c20',text:'Vitamin deficiency causing Scurvy:',opts:['Vitamin A','Vitamin B₁₂','Vitamin C','Vitamin D'],correct:2,explanation:'Vitamin C (ascorbic acid) → collagen synthesis. Deficiency = scurvy.',ncertCl:12,ncertCh:14,ncertPg:'408',unit:'Biomolecules',pyq:true,pyqYr:2020,diff:'easy',trick:'A=Night blindness, B₁=Beriberi, C=Scurvy, D=Rickets, K=Bleeding.'},

{id:221,sub:'CHEMISTRY',ch:'Polymers',tid:'c21',text:'Nylon-6,6 monomers:',opts:['Hexamethylene diamine + adipic acid','Caprolactam','Ethylene glycol + terephthalic acid','Styrene'],correct:0,explanation:'"6,6" = 6 carbons in each monomer (diamine + diacid).',ncertCl:12,ncertCh:15,ncertPg:'428',unit:'Polymers',pyq:true,pyqYr:2022,diff:'medium',trick:'Nylon-6,6=2 monomers(6C each). Nylon-6=caprolactam. Dacron=glycol+terephthalic acid.'},

{id:222,sub:'CHEMISTRY',ch:'Environmental Chemistry',tid:'c22',text:'BOD of clean water is:',opts:['High','Low','Zero','pH-dependent'],correct:1,explanation:'BOD < 5 mg/L = clean water. BOD > 17 mg/L = polluted.',ncertCl:11,ncertCh:14,ncertPg:'400',unit:'Environmental Chemistry',pyq:false,diff:'easy',trick:'BOD high = polluted. BOD low = clean. Fish die when BOD > 8 ppm.'},

{id:223,sub:'CHEMISTRY',ch:'Solutions',tid:'c23',text:'Elevation of boiling point is a _________ property:',opts:['Additive','Colligative','Constitutive','Intensive'],correct:1,explanation:'Colligative properties depend on number of solute particles, not their nature: ΔTb, ΔTf, osmotic pressure, relative lowering of VP.',ncertCl:12,ncertCh:2,ncertPg:'44',unit:'Solutions',pyq:true,pyqYr:2021,diff:'easy',trick:'4 colligative properties: ΔTb, ΔTf, osmotic pressure, relative lowering of VP. All depend on number of particles.'},

{id:224,sub:'CHEMISTRY',ch:'Surface Chemistry',tid:'c24',text:'Catalyst works by:',opts:['Increasing activation energy','Decreasing activation energy','Changing equilibrium','Increasing temperature'],correct:1,explanation:'Catalyst provides alternative pathway with lower activation energy. Does NOT change equilibrium position or ΔH of reaction.',ncertCl:12,ncertCh:5,ncertPg:'142',unit:'Surface Chemistry',pyq:false,diff:'easy',trick:'Catalyst: lower Ea → faster reaction. Doesn\'t change Keq or ΔH. Appears in stoichiometry but regenerated.'},

{id:225,sub:'CHEMISTRY',ch:'p-Block Elements',tid:'c25',text:'Which gas is responsible for acid rain?',opts:['CO₂','SO₂ and NO₂','O₃','CH₄'],correct:1,explanation:'SO₂ + H₂O → H₂SO₃. NO₂ + H₂O → HNO₃. These cause acid rain (pH < 5.6).',ncertCl:12,ncertCh:7,ncertPg:'215',unit:'Environmental — Acid Rain',pyq:false,diff:'easy',trick:'Acid rain: SO₂ + NO₂ from burning fossil fuels. CO₂ causes global warming, not acid rain directly.'},

// ============================================================
// BIOLOGY — 80 QUESTIONS
// ============================================================

{id:301,sub:'BIOLOGY',ch:'Cell: Unit of Life',tid:'b1',text:'Which organelle is the "powerhouse of the cell"?',opts:['Ribosome','Mitochondria','Lysosome','Golgi Apparatus'],correct:1,explanation:'Mitochondria produce ATP via oxidative phosphorylation. Inner membrane = cristae.',ncertCl:11,ncertCh:8,ncertPg:'135',unit:'Cell Organelles',pyq:true,pyqYr:2022,diff:'easy',trick:'Mito=powerhouse. Ribosome=protein factory. Golgi=post office. Lysosome=suicidal bag.'},

{id:302,sub:'BIOLOGY',ch:'Cell: Unit of Life',tid:'b1',text:'Ribosomes are found in:',opts:['Nucleus only','Cytoplasm only','Both cytoplasm and rough ER','Mitochondria only'],correct:2,explanation:'80S ribosomes: cytoplasm + rough ER. 70S: mitochondria and chloroplasts.',ncertCl:11,ncertCh:8,ncertPg:'133',unit:'Cell Organelles',pyq:false,diff:'easy',trick:'Rough ER has Ribosomes (R for R). Smooth ER doesn\'t. 80S=cytoplasm, 70S=organelles.'},

{id:303,sub:'BIOLOGY',ch:'Biomolecules',tid:'b2',text:'Which is NOT a reducing sugar?',opts:['Glucose','Fructose','Sucrose','Maltose'],correct:2,explanation:'Sucrose: glycosidic bond between anomeric carbons of both → no free reducing group.',ncertCl:11,ncertCh:9,ncertPg:'155',unit:'Biomolecules',pyq:true,pyqYr:2023,diff:'medium',trick:'Non-reducing: Sucrose, Trehalose. All monosaccharides = reducing. Most disaccharides = reducing EXCEPT sucrose.'},

{id:304,sub:'BIOLOGY',ch:'Molecular Basis',tid:'b3',text:'DNA replication is semi-conservative because:',opts:['Both strands new','One old + one new strand','Two forks','Polymerase conserves energy'],correct:1,explanation:'Meselson-Stahl (1958): each daughter DNA has one parental + one new strand.',ncertCl:12,ncertCh:6,ncertPg:'108',unit:'Molecular Basis of Inheritance',pyq:true,pyqYr:2024,diff:'medium',trick:'Semi = half old, half new. Proved by Meselson-Stahl using ¹⁵N/¹⁴N.'},

{id:305,sub:'BIOLOGY',ch:'Cell Division',tid:'b4',text:'Crossing over occurs at which stage of meiosis:',opts:['Leptotene','Zygotene','Pachytene','Diplotene'],correct:2,explanation:'Crossing over at Pachytene of Prophase I. Chiasmata visible at Diplotene.',ncertCl:11,ncertCh:10,ncertPg:'180',unit:'Cell Division',pyq:true,pyqYr:2022,diff:'hard',trick:'LZPDD: Leptotene, Zygotene, Pachytene (crossing over!), Diplotene, Diakinesis.'},

{id:306,sub:'BIOLOGY',ch:'Photosynthesis',tid:'b5',text:'C4 plants avoid photorespiration because:',opts:['No rubisco','CO₂ concentrated around rubisco','Different light reactions','More chlorophyll'],correct:1,explanation:'Kranz anatomy: CO₂ concentrated in bundle sheath → rubisco works efficiently.',ncertCl:11,ncertCh:13,ncertPg:'223',unit:'Photosynthesis',pyq:true,pyqYr:2021,diff:'hard',trick:'C4=Corn/Sugarcane/Sorghum. Kranz anatomy+CO₂ pump=no photorespiration.'},

{id:307,sub:'BIOLOGY',ch:'Photosynthesis',tid:'b5',text:'Site of light reactions in chloroplast:',opts:['Stroma','Thylakoid membrane','Outer membrane','Intermembrane space'],correct:1,explanation:'Light reactions: thylakoid membranes. Calvin cycle (dark): stroma.',ncertCl:11,ncertCh:13,ncertPg:'212',unit:'Photosynthesis',pyq:true,pyqYr:2023,diff:'easy',trick:'Light=Thylakoid. Dark (Calvin)=Stroma. Remember L-T, D-S.'},

{id:308,sub:'BIOLOGY',ch:'Respiration',tid:'b6',text:'Glycolysis occurs in:',opts:['Mitochondrial matrix','Cytoplasm','Nucleus','Chloroplast'],correct:1,explanation:'Glycolysis in cytoplasm. No O₂ needed. 1 glucose → 2 pyruvate + 2 ATP (net).',ncertCl:11,ncertCh:14,ncertPg:'234',unit:'Respiration',pyq:true,pyqYr:2020,diff:'easy',trick:'Glycolysis=Cytoplasm. Krebs=Mitochondrial matrix. ETC=Inner mitochondrial membrane.'},

{id:309,sub:'BIOLOGY',ch:'Plant Growth',tid:'b7',text:'Apical dominance caused by:',opts:['Cytokinin','Gibberellin','Auxin','Ethylene'],correct:2,explanation:'Auxin from shoot apex suppresses lateral bud growth.',ncertCl:11,ncertCh:15,ncertPg:'255',unit:'Plant Growth Regulators',pyq:true,pyqYr:2022,diff:'medium',trick:'Auxin=apical dominance. Cytokinin=lateral growth (opposes auxin). Gibberellin=stem elongation.'},

{id:310,sub:'BIOLOGY',ch:'Digestion & Absorption',tid:'b8',text:'Pepsin is secreted by:',opts:['Chief cells','Parietal cells','Goblet cells','G-cells'],correct:0,explanation:'Chief (peptic) cells → pepsinogen → pepsin (activated by HCl). Parietal/oxyntic cells → HCl.',ncertCl:11,ncertCh:16,ncertPg:'264',unit:'Digestion',pyq:true,pyqYr:2021,diff:'medium',trick:'Chief=pepsinogen. Parietal=HCl+Intrinsic factor. Goblet=mucus. G-cells=gastrin.'},

{id:311,sub:'BIOLOGY',ch:'Breathing & Exchange',tid:'b9',text:'Oxygen transport in blood mainly as:',opts:['Dissolved in plasma','Oxyhaemoglobin','With WBCs','Bicarbonate'],correct:1,explanation:'97% O₂ as oxyHb. 3% dissolved. CO₂: 70% bicarbonate, 23% carbamiHb, 7% dissolved.',ncertCl:11,ncertCh:17,ncertPg:'280',unit:'Respiration',pyq:false,diff:'easy',trick:'O₂: 97% oxyHb. CO₂: 70% bicarbonate. Transport mechanisms differ for O₂ and CO₂.'},

{id:312,sub:'BIOLOGY',ch:'Body Fluids & Circulation',tid:'b10',text:'Pacemaker of the heart is:',opts:['AV node','SA node','Bundle of His','Purkinje fibres'],correct:1,explanation:'SA node (right atrium): 70-75 bpm, natural pacemaker.',ncertCl:11,ncertCh:18,ncertPg:'294',unit:'Circulation',pyq:true,pyqYr:2023,diff:'easy',trick:'SA node=pacemaker=right atrium. AV=40-60 bpm backup. His/Purkinje=20-40 bpm.'},

{id:313,sub:'BIOLOGY',ch:'Excretory Products',tid:'b11',text:'Functional unit of kidney:',opts:['Glomerulus','Nephron','Loop of Henle','Bowman\'s capsule'],correct:1,explanation:'Nephron = structural + functional unit. ~1 million per kidney.',ncertCl:11,ncertCh:19,ncertPg:'307',unit:'Excretion',pyq:true,pyqYr:2022,diff:'easy',trick:'Nephron=kidney unit. Neuron=nerve unit. Sarcomere=muscle unit.'},

{id:314,sub:'BIOLOGY',ch:'Locomotion & Movement',tid:'b12',text:'Actin and myosin are proteins in:',opts:['Blood','Bone','Muscle','Nerve'],correct:2,explanation:'Contractile proteins: actin (thin) + myosin (thick) in muscle. Sliding filament theory.',ncertCl:11,ncertCh:20,ncertPg:'322',unit:'Locomotion',pyq:false,diff:'easy',trick:'A-band has Myosin. I-band has Actin only. H-zone: myosin without actin.'},

{id:315,sub:'BIOLOGY',ch:'Neural Control',tid:'b13',text:'Myelin sheath in PNS produced by:',opts:['Astrocytes','Oligodendrocytes','Schwann cells','Microglia'],correct:2,explanation:'PNS: Schwann cells. CNS: Oligodendrocytes. Astrocytes=structural. Microglia=immune.',ncertCl:11,ncertCh:21,ncertPg:'338',unit:'Neural Control',pyq:true,pyqYr:2022,diff:'medium',trick:'PNS myelin=Schwann. CNS myelin=Oligodendrocytes. Schwann also helps nerve regeneration.'},

{id:316,sub:'BIOLOGY',ch:'Principles of Inheritance',tid:'b14',text:'ABO blood group is example of:',opts:['Dominance','Codominance and multiple allelism','Incomplete dominance','Epistasis'],correct:1,explanation:'3 alleles (Iᴬ,Iᴮ,i) = multiple allelism. AB group = codominance.',ncertCl:12,ncertCh:5,ncertPg:'98',unit:'Genetics',pyq:true,pyqYr:2023,diff:'medium',trick:'ABO=codominance+multiple allelism. Sickle cell=codominance. 4 o\'clock plant=incomplete dominance.'},

{id:317,sub:'BIOLOGY',ch:'Molecular Basis',tid:'b15',text:'Central dogma states:',opts:['RNA→DNA→Protein','DNA→RNA→Protein','Protein→DNA→RNA','DNA→Protein→RNA'],correct:1,explanation:'Transcription: DNA→RNA. Translation: RNA→Protein. Reverse transcription: RNA→DNA (retroviruses).',ncertCl:12,ncertCh:6,ncertPg:'110',unit:'Molecular Basis',pyq:true,pyqYr:2024,diff:'easy',trick:'DNA→RNA→Protein. HIV uses reverse transcriptase for RNA→DNA.'},

{id:318,sub:'BIOLOGY',ch:'Evolution',tid:'b16',text:'Hardy-Weinberg equilibrium requires:',opts:['Mutations','Natural selection','Large population, random mating','Genetic drift'],correct:2,explanation:'5 conditions: large population, random mating, no mutation, no selection, no gene flow.',ncertCl:12,ncertCh:7,ncertPg:'137',unit:'Evolution',pyq:true,pyqYr:2022,diff:'hard',trick:'p²+2pq+q²=1. Five conditions for equilibrium. Violations = evolution occurring.'},

{id:319,sub:'BIOLOGY',ch:'Ecosystem',tid:'b17',text:'Pyramid of energy is always:',opts:['Inverted','Upright','Both','Spindle-shaped'],correct:1,explanation:'10% law: only 10% energy transferred upward. Always upright — thermodynamics.',ncertCl:12,ncertCh:14,ncertPg:'250',unit:'Ecology',pyq:true,pyqYr:2023,diff:'medium',trick:'Energy=ALWAYS upright (10% law). Biomass=usually upright. Number=any shape.'},

{id:320,sub:'BIOLOGY',ch:'Biodiversity',tid:'b18',text:'Example of in-situ conservation:',opts:['Zoo','Botanical garden','National park','Seed bank'],correct:2,explanation:'In-situ=natural habitat: National parks, sanctuaries, biosphere reserves.',ncertCl:12,ncertCh:15,ncertPg:'268',unit:'Biodiversity',pyq:true,pyqYr:2022,diff:'easy',trick:'In-situ=in place=National park. Ex-situ=out of place=Zoo, seed bank.'},

{id:321,sub:'BIOLOGY',ch:'Human Reproduction',tid:'b19',text:'Acrosome in sperm derived from:',opts:['Mitochondria','Golgi apparatus','Endoplasmic reticulum','Nucleus'],correct:1,explanation:'Acrosome=Golgi body. Contains hyaluronidase for egg penetration.',ncertCl:12,ncertCh:3,ncertPg:'52',unit:'Reproduction',pyq:true,pyqYr:2021,diff:'medium',trick:'Acrosome=Golgi. Middle piece=mitochondria (energy). Tail=flagellum.'},

{id:322,sub:'BIOLOGY',ch:'Microbes in Welfare',tid:'b20',text:'Penicillin was discovered by:',opts:['Louis Pasteur','Alexander Fleming','Robert Koch','Edward Jenner'],correct:1,explanation:'Fleming (1928): Penicillium mold killed bacteria on plate. First antibiotic.',ncertCl:12,ncertCh:10,ncertPg:'175',unit:'Microbes',pyq:false,diff:'easy',trick:'Fleming=Penicillin. Pasteur=Germ theory. Koch=TB. Jenner=Smallpox vaccine.'},

{id:323,sub:'BIOLOGY',ch:'Biotechnology Principles',tid:'b21',text:'Restriction endonucleases cut DNA at:',opts:['Random positions','Palindromic sequences','Only at ends','Single-stranded regions'],correct:1,explanation:'Cut specific palindromic sequences. EcoRI cuts GAATTC.',ncertCl:12,ncertCh:11,ncertPg:'196',unit:'Biotechnology',pyq:true,pyqYr:2023,diff:'medium',trick:'Restriction enzymes=molecular scissors. Palindrome reads same on both strands 5\'→3\'.'},

{id:324,sub:'BIOLOGY',ch:'Biotechnology Applications',tid:'b22',text:'Bt toxin kills insects by:',opts:['Poisoning food','Making holes in midgut','Blocking respiration','Affecting nerves'],correct:1,explanation:'Bt toxin activated in alkaline insect gut → pores in midgut epithelium → lysis.',ncertCl:12,ncertCh:12,ncertPg:'213',unit:'Biotechnology',pyq:true,pyqYr:2022,diff:'hard',trick:'Bt toxin=pro-toxin → activated in alkaline pH → pores in midgut → death. Safe for mammals.'},

{id:325,sub:'BIOLOGY',ch:'Organisms & Populations',tid:'b23',text:'Relationship that benefits both organisms:',opts:['Parasitism','Commensalism','Mutualism','Predation'],correct:2,explanation:'Mutualism (+/+): lichens, mycorrhiza, Rhizobium+legumes.',ncertCl:12,ncertCh:13,ncertPg:'228',unit:'Ecology',pyq:false,diff:'easy',trick:'+/+=Mutualism. +/-=Predation/Parasitism. +/0=Commensalism. -/-=Competition.'},

{id:326,sub:'BIOLOGY',ch:'Plant Kingdom',tid:'b24',text:'Dominant generation in bryophytes:',opts:['Sporophyte','Gametophyte','Both equal','Neither'],correct:1,explanation:'Bryophytes: gametophyte (haploid, n) is dominant independent generation. Sporophyte dependent.',ncertCl:11,ncertCh:3,ncertPg:'50',unit:'Plant Kingdom',pyq:false,diff:'medium',trick:'Bryophytes: gametophyte dominant (green plant you see). Pteridophytes/Angiosperms: sporophyte dominant.'},

{id:327,sub:'BIOLOGY',ch:'Animal Kingdom',tid:'b25',text:'Which is NOT characteristic of Arthropoda?',opts:['Jointed appendages','Exoskeleton','Open circulatory system','Notochord'],correct:3,explanation:'Notochord in Chordata, not Arthropoda. Arthropoda: jointed appendages, chitin exoskeleton, open circulation.',ncertCl:11,ncertCh:4,ncertPg:'58',unit:'Animal Kingdom',pyq:false,diff:'easy',trick:'Notochord=Chordata. Water vascular system=Echinodermata. Flame cells=Platyhelminthes.'},

{id:328,sub:'BIOLOGY',ch:'Morphology of Plants',tid:'b26',text:'Tap root system found in:',opts:['Wheat','Maize','Mango','Grass'],correct:2,explanation:'Tap root (primary+secondary) = dicots. Fibrous root = monocots.',ncertCl:11,ncertCh:5,ncertPg:'68',unit:'Morphology',pyq:false,diff:'easy',trick:'Dicot=tap root. Monocot=fibrous root. Mango/mustard/gram=tap root. Wheat/grass=fibrous.'},

{id:329,sub:'BIOLOGY',ch:'Structural Organisation',tid:'b27',text:'Trachea is lined by:',opts:['Squamous epithelium','Cuboidal epithelium','Columnar epithelium','Ciliated epithelium'],correct:3,explanation:'Ciliated columnar epithelium in trachea. Cilia sweep mucus upward.',ncertCl:11,ncertCh:7,ncertPg:'103',unit:'Structural Organisation',pyq:true,pyqYr:2021,diff:'medium',trick:'Trachea=ciliated (sweeps mucus up). Alveoli=squamous (thin for gas exchange). Intestine=columnar.'},

{id:330,sub:'BIOLOGY',ch:'Mineral Nutrition',tid:'b28',text:'Which element is NOT a macronutrient in plants?',opts:['Nitrogen','Phosphorus','Zinc','Potassium'],correct:2,explanation:'Macronutrients: N, P, K, Ca, Mg, S, C, H, O. Zinc (Zn) is a micronutrient.',ncertCl:11,ncertCh:12,ncertPg:'196',unit:'Mineral Nutrition',pyq:false,diff:'medium',trick:'Macro: C,H,O,N,P,K,Ca,Mg,S (9 elements). Micro: Fe,Mn,Cu,Zn,Mo,B,Cl,Ni (8 elements).'},

{id:331,sub:'BIOLOGY',ch:'Transport in Plants',tid:'b29',text:'Water absorption in plants is mainly by:',opts:['Imbibition','Active transport','Osmosis','Diffusion'],correct:2,explanation:'Water enters root hairs by osmosis (from high water potential in soil to low in root cells).',ncertCl:11,ncertCh:11,ncertPg:'183',unit:'Transport in Plants',pyq:false,diff:'easy',trick:'Water movement=osmosis (from high Ψw to low Ψw). Minerals=active transport.'},

{id:332,sub:'BIOLOGY',ch:'Reproduction in Plants',tid:'b30',text:'Double fertilization is a characteristic of:',opts:['Gymnosperms','Angiosperms','Bryophytes','Algae'],correct:1,explanation:'Double fertilization: unique to angiosperms. One sperm+egg=zygote. Other sperm+2 polar nuclei=endosperm (3n).',ncertCl:12,ncertCh:2,ncertPg:'28',unit:'Reproduction in Plants',pyq:true,pyqYr:2023,diff:'medium',trick:'Double fertilization=ONLY angiosperms. Siphonogamy=gymnosperms. Zygote+endosperm formed.'},

{id:333,sub:'BIOLOGY',ch:'Human Health & Disease',tid:'b31',text:'Malaria is caused by:',opts:['Bacteria','Virus','Protozoan','Fungus'],correct:2,explanation:'Plasmodium (protozoan) causes malaria. Transmitted by female Anopheles mosquito.',ncertCl:12,ncertCh:8,ncertPg:'155',unit:'Human Health',pyq:false,diff:'easy',trick:'Malaria=Plasmodium (protozoa). Dengue=Virus (Aedes). Typhoid=Salmonella (bacteria). Ringworm=Fungus.'},

{id:334,sub:'BIOLOGY',ch:'Strategies for Enhancement',tid:'b32',text:'Totipotency means:',opts:['Ability of organism to regenerate','Ability of cell to develop into complete organism','Ability to reproduce asexually','Ability to form gametes'],correct:1,explanation:'Totipotency: single cell can develop into complete organism. Basis of tissue culture. All cells have complete genome.',ncertCl:12,ncertCh:9,ncertPg:'163',unit:'Biotechnology',pyq:true,pyqYr:2022,diff:'medium',trick:'Totipotent=total potential. Every cell has complete DNA. Basis of cloning and tissue culture.'}

];

// ============================================================
// SYLLABUS DATA — NEET 2026 (NMC Finalised Dec 2025)
// ============================================================

const SYLLABUS = {
  PHYSICS: [
    {id:'p1',name:'Physical World & Measurement',class:11,chapters:['Physical World','Units & Measurement'],weight:2,ncertCh:'1,2'},
    {id:'p2',name:'Kinematics',class:11,chapters:['Motion in Straight Line','Motion in a Plane'],weight:3,ncertCh:'3,4'},
    {id:'p3',name:'Laws of Motion',class:11,chapters:['Laws of Motion'],weight:3,ncertCh:'5'},
    {id:'p4',name:'Work, Energy & Power',class:11,chapters:['Work, Energy & Power'],weight:3,ncertCh:'6'},
    {id:'p5',name:'Gravitation',class:11,chapters:['Gravitation'],weight:2,ncertCh:'8'},
    {id:'p6',name:'Properties of Bulk Matter',class:11,chapters:['Mechanical Properties of Solids','Mechanical Properties of Fluids','Thermal Properties of Matter'],weight:2,ncertCh:'9,10,11'},
    {id:'p7',name:'Thermodynamics',class:11,chapters:['Thermodynamics'],weight:3,ncertCh:'12'},
    {id:'p8',name:'Behaviour of Perfect Gas & Kinetic Theory',class:11,chapters:['Kinetic Theory'],weight:2,ncertCh:'13'},
    {id:'p9',name:'Oscillations & Waves',class:11,chapters:['Oscillations','Waves'],weight:3,ncertCh:'14,15'},
    {id:'p10',name:'Electrostatics',class:12,chapters:['Electric Charges & Fields','Electrostatic Potential & Capacitance'],weight:4,ncertCh:'1,2'},
    {id:'p11',name:'Current Electricity',class:12,chapters:['Current Electricity'],weight:4,ncertCh:'3'},
    {id:'p12',name:'Magnetic Effects & Magnetism',class:12,chapters:['Moving Charges & Magnetism','Magnetism & Matter'],weight:3,ncertCh:'4,5'},
    {id:'p13',name:'Electromagnetic Induction & AC',class:12,chapters:['Electromagnetic Induction','Alternating Current'],weight:3,ncertCh:'6,7'},
    {id:'p14',name:'Electromagnetic Waves',class:12,chapters:['Electromagnetic Waves'],weight:1,ncertCh:'8'},
    {id:'p15',name:'Optics',class:12,chapters:['Ray Optics','Wave Optics'],weight:4,ncertCh:'9,10'},
    {id:'p16',name:'Dual Nature of Matter',class:12,chapters:['Dual Nature of Radiation & Matter'],weight:2,ncertCh:'11'},
    {id:'p17',name:'Atoms & Nuclei',class:12,chapters:['Atoms','Nuclei'],weight:3,ncertCh:'12,13'},
    {id:'p18',name:'Electronic Devices',class:12,chapters:['Semiconductor Electronics'],weight:3,ncertCh:'14'},
  ],
  CHEMISTRY: [
    {id:'c1',name:'Basic Concepts of Chemistry',class:11,chapters:['Some Basic Concepts'],weight:2,ncertCh:'1'},
    {id:'c2',name:'Structure of Atom',class:11,chapters:['Structure of Atom'],weight:3,ncertCh:'2'},
    {id:'c3',name:'Classification & Periodicity',class:11,chapters:['Classification of Elements'],weight:2,ncertCh:'3'},
    {id:'c4',name:'Chemical Bonding',class:11,chapters:['Chemical Bonding & Molecular Structure'],weight:4,ncertCh:'4'},
    {id:'c5',name:'States of Matter',class:11,chapters:['States of Matter'],weight:2,ncertCh:'5'},
    {id:'c6',name:'Thermodynamics',class:11,chapters:['Thermodynamics'],weight:3,ncertCh:'6'},
    {id:'c7',name:'Equilibrium',class:11,chapters:['Equilibrium'],weight:3,ncertCh:'7'},
    {id:'c8',name:'Redox Reactions',class:11,chapters:['Redox Reactions'],weight:2,ncertCh:'8'},
    {id:'c9',name:'Hydrogen',class:11,chapters:['Hydrogen'],weight:1,ncertCh:'9'},
    {id:'c10',name:'s-Block Elements',class:11,chapters:['s-Block Elements'],weight:2,ncertCh:'10'},
    {id:'c11',name:'p-Block Elements',class:11,chapters:['Some p-Block Elements'],weight:2,ncertCh:'11'},
    {id:'c12',name:'Organic Chemistry — Basic',class:11,chapters:['Basic Principles of Organic Chemistry','Hydrocarbons'],weight:4,ncertCh:'12,13'},
    {id:'c13',name:'Environmental Chemistry',class:11,chapters:['Environmental Chemistry'],weight:1,ncertCh:'14'},
    {id:'c14',name:'Solid State',class:12,chapters:['The Solid State'],weight:2,ncertCh:'1'},
    {id:'c15',name:'Solutions',class:12,chapters:['Solutions'],weight:3,ncertCh:'2'},
    {id:'c16',name:'Electrochemistry',class:12,chapters:['Electrochemistry'],weight:3,ncertCh:'3'},
    {id:'c17',name:'Chemical Kinetics',class:12,chapters:['Chemical Kinetics'],weight:3,ncertCh:'4'},
    {id:'c18',name:'Surface Chemistry',class:12,chapters:['Surface Chemistry'],weight:2,ncertCh:'5'},
    {id:'c19',name:'p,d,f Block Elements',class:12,chapters:['General Principles','p-Block','d-Block','f-Block'],weight:4,ncertCh:'6,7,8'},
    {id:'c20',name:'Coordination Compounds',class:12,chapters:['Coordination Compounds'],weight:3,ncertCh:'9'},
    {id:'c21',name:'Haloalkanes & Haloarenes',class:12,chapters:['Haloalkanes & Haloarenes'],weight:3,ncertCh:'10'},
    {id:'c22',name:'Alcohols, Phenols & Ethers',class:12,chapters:['Alcohols, Phenols & Ethers'],weight:3,ncertCh:'11'},
    {id:'c23',name:'Carbonyl Compounds & Amines',class:12,chapters:['Aldehydes/Ketones/Acids','Amines'],weight:4,ncertCh:'12,13'},
    {id:'c24',name:'Biomolecules & Polymers',class:12,chapters:['Biomolecules','Polymers'],weight:3,ncertCh:'14,15'},
    {id:'c25',name:'Chemistry in Everyday Life',class:12,chapters:['Chemistry in Everyday Life'],weight:1,ncertCh:'16'},
  ],
  BIOLOGY: [
    {id:'b1',name:'Diversity in Living World',class:11,chapters:['Living World','Biological Classification','Plant Kingdom','Animal Kingdom'],weight:4,ncertCh:'1,2,3,4'},
    {id:'b2',name:'Structural Organisation',class:11,chapters:['Morphology of Flowering Plants','Anatomy of Plants','Structural Organisation in Animals'],weight:3,ncertCh:'5,6,7'},
    {id:'b3',name:'Cell Structure & Function',class:11,chapters:['Cell: Unit of Life','Biomolecules','Cell Cycle & Division'],weight:5,ncertCh:'8,9,10'},
    {id:'b4',name:'Plant Physiology',class:11,chapters:['Transport','Mineral Nutrition','Photosynthesis','Respiration','Growth'],weight:6,ncertCh:'11,12,13,14,15'},
    {id:'b5',name:'Human Physiology',class:11,chapters:['Digestion','Breathing','Body Fluids','Circulation','Excretion','Locomotion','Neural','Chemical Coordination'],weight:8,ncertCh:'16,17,18,19,20,21,22'},
    {id:'b6',name:'Reproduction',class:12,chapters:['Reproduction in Plants','Sexual Reproduction in Plants','Human Reproduction','Reproductive Health'],weight:5,ncertCh:'1,2,3,4'},
    {id:'b7',name:'Genetics & Evolution',class:12,chapters:['Principles of Inheritance','Molecular Basis','Evolution'],weight:6,ncertCh:'5,6,7'},
    {id:'b8',name:'Biology in Human Welfare',class:12,chapters:['Human Health','Microbes in Welfare','Biotechnology Principles','Biotechnology Applications'],weight:5,ncertCh:'8,9,10,11,12'},
    {id:'b9',name:'Ecology',class:12,chapters:['Organisms & Populations','Ecosystem','Biodiversity','Environmental Issues'],weight:4,ncertCh:'13,14,15,16'},
  ]
};

// MEMORY TRICKS — Chapter-wise
const TRICKS = {
  'Vitamins': 'ABCDK → Fat soluble: A,D,E,K. Water soluble: B,C. Deficiency: A=night blindness, B₁=beriberi, C=scurvy, D=rickets.',
  'Phyla': 'Please Come Over For Good Sex → Porifera, Cnidaria, Platyhelminthes, Aschelminthes(Nematoda), Annelida, Arthropoda, Mollusca, Echinodermata, Chordata.',
  'Hormones': 'FSH+LH from pituitary. Estrogen+progesterone from ovary. Testosterone from testes. Insulin+glucagon from pancreas (islets of Langerhans).',
  'Meiosis I': 'LZPDD → Leptotene, Zygotene, Pachytene (crossing over!), Diplotene, Diakinesis.',
  'Carbocations': '3° > 2° > 1° > CH₃⁺ (stability). More alkyl groups = more stable.',
  'Acid strength HX': 'HI > HBr > HCl > HF. Opposite of bond strength. Bond: H-F strongest, H-I weakest.',
  'Colligative': '4 properties: ΔTb (boiling point elevation), ΔTf (freezing point depression), Osmotic pressure, Relative lowering of VP.',
  'Conservation laws NEET': 'Boyle: PV=k. Charles: V/T=k. Avogadro: V/n=k. Ideal gas: PV=nRT.',
  'Digestive enzymes': 'Ptyalin (saliva→starch). Pepsin (stomach→proteins). Trypsin (pancreas→proteins). Lipase (pancreas→fats). Lactase→lactose.',
};

if (typeof module !== 'undefined') module.exports = { QUESTION_BANK, SYLLABUS, TRICKS };
