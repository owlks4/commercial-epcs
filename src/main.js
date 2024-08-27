import './style.css'
import 'leaflet'
import "leaflet-providers";
import { ZipReader, BlobReader, TextWriter} from '@zip.js/zip.js';
import { parse } from 'papaparse';
import { rectangle } from 'leaflet';

let BOUNDS = [[52.470929538389235, -1.8681315185627474],[52.445207838077096, -1.806846604153346]];
var map = L.map('map').setView([(BOUNDS[0][0] + BOUNDS[1][0]) / 2, (BOUNDS[0][1] + BOUNDS[1][1]) / 2]).fitBounds(BOUNDS);

const shortPaybackCheckbox = document.getElementById("payback-time-short-checkbox");
shortPaybackCheckbox.checked = true;
shortPaybackCheckbox.oninput = () => {rerenderDatapoints();};
const mediumPaybackCheckbox = document.getElementById("payback-time-medium-checkbox");
mediumPaybackCheckbox.checked = true;
mediumPaybackCheckbox.oninput = () => {rerenderDatapoints();};
const longPaybackCheckbox = document.getElementById("payback-time-long-checkbox");
longPaybackCheckbox.checked = true;
longPaybackCheckbox.oninput = () => {rerenderDatapoints();};
const otherPaybackCheckbox = document.getElementById("payback-time-other-checkbox");
otherPaybackCheckbox.checked = true;
otherPaybackCheckbox.oninput = () => {rerenderDatapoints();};

function isFilterCheckboxCheckedForPaybackType(type){
  switch (type){
    case "SHORT":
      return shortPaybackCheckbox.checked;
    case "MEDIUM":
      return mediumPaybackCheckbox.checked;
    case "LONG":
      return longPaybackCheckbox.checked;
    case "OTHER":
      return otherPaybackCheckbox.checked;
    default:
      alert("Unhandled payback time type!")
      return null;
  }
}

let recsArea = document.getElementById("recs-area");

L.tileLayer.provider("OpenStreetMap.Mapnik").addTo(map);

let UPRNLookup = {};
let certificates = null;
let columns = null;
let recommendations = null;
let schema = null;

const paybackTypes = {"short":0, "SHORT":0, "medium":1, "MEDIUM":1, "long":2, "LONG":2, "other":3, "OTHER":3};

let mostRecentlySelectedCert = null;

let epcRecsFiltersElement = document.getElementById("epc-recs-filters");

class EPCRecCategory {
  constructor(displayName, internalName, show){
    this.displayName = displayName;
    this.internalName = internalName;
    this.show = show;
  }
}

let epcRecCategories = [
  new EPCRecCategory("Cooling","REC_C", true),
  new EPCRecCategory("Hot water","REC_W", true),
  new EPCRecCategory("Envelope","REC_E", true),
  new EPCRecCategory("Fuel-switching","REC_F", true),
  new EPCRecCategory("Heating","REC_H", true),
  new EPCRecCategory("Lighting","REC_L", true),
  new EPCRecCategory("Overheating","REC_V", true),
  new EPCRecCategory("Renewable energy","REC_R", true),
  new EPCRecCategory("Comment","REC_U", true),
]

function getEPCRecCategoryByCode(code){
  if (code[4] == undefined){
    if (code == "USER"){
      return getEPCRecCategoryByInternalName("REC_U");
    }
  }
  for (let i = 0; i < epcRecCategories.length; i++){
    if (epcRecCategories[i].internalName[4] == code[4]){
      return epcRecCategories[i];
    }
  }
  return null;
}

function getEPCRecCategoryByInternalName(name){
  for (let i = 0; i < epcRecCategories.length; i++){
    if (epcRecCategories[i].internalName == name){
      return epcRecCategories[i];
    }
  }
  return null;
}

epcRecCategories.forEach(category => {
  let div = document.createElement("div");
  let checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  checkbox.id = "checkbox-"+category.internalName;
  checkbox.oninput = (e) => {category.show = e.target.checked; rerenderDatapoints();};
  let label = document.createElement("label");
  label.innerText = category.displayName;
  label.setAttribute("for",checkbox.id);
  div.appendChild(checkbox);
  div.appendChild(label);
  epcRecsFiltersElement.appendChild(div);
});

tryLoadUPRNLookup();

async function tryLoadUPRNLookup(){
    const url = "./UPRNlookup.csv";
    try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Response status: ${response.status}`);
        }
        console.log("Loading UPRN lookup...")
        const csv = parse(await response.text(),{header:true, transform:(a,b)=>{if (b == "latitude" || b == "longitude"){return parseFloat(a)} else {return a}}});
        csv.data.forEach(item => {
            if (item.uprn == ""){
              return;
            }
            if (item.longitude < BOUNDS[0][1] || item.longitude > BOUNDS[1][1]){
              return;
            }
            if (item.latitude > BOUNDS[0][0] || item.latitude < BOUNDS[1][0]){
              return;
            }
            UPRNLookup[item.uprn] = [item.latitude, item.longitude];
        })        
      } catch (error) {
        console.error(error.message);
      }
    await tryLoadEmbeddedZip();
}

async function tryLoadEmbeddedZip() {
    const url = "./epc.zip";
    console.log("Trying to load embedded zip...")
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }
      const zipFileReader = new BlobReader(await response.blob());
      const zipReader = new ZipReader(zipFileReader);
      const entries = await zipReader.getEntries();

      let NUM_FILES_FOR_COMPLETE_READ = 4;
      let numFilesProcessed = 0;

      entries.forEach(async entry => {
        const textWriter = new TextWriter();
        switch (entry.filename){
            case "certificates.csv":
                certificates = parse(await entry.getData(textWriter), {header:true});
            break;
            case "columns.csv":
                columns = parse(await entry.getData(textWriter), {header:true});
            break;
            case "recommendations.csv":
                recommendations = parse(await entry.getData(textWriter), {header:true}); //the LMK keys seem to be in order, so you could use binarysearch to get an answer pretty quickly from this
            break;
            case "schema.json":
                schema = JSON.parse(await entry.getData(textWriter));
            break;
            default:
            return;
        }
        numFilesProcessed++;
        if (numFilesProcessed == NUM_FILES_FOR_COMPLETE_READ){
            console.log("Embedded zip loaded")
            console.log("Sorting certs by UPRN...")
            certificates.data.sort((a,b) => {
              if (a.UPRN == b.UPRN){  //sort by UPRN and then lodgement date if the UPRNs are the same
                let lodgeA = Date.parse(a.LODGEMENT_DATETIME);
                let lodgeB = Date.parse(b.LODGEMENT_DATETIME);
                return lodgeA == lodgeB ? 0 : (lodgeA < lodgeB ? -1 : 1);
              } 
              return a.UPRN < b.UPRN ? -1 : 1;
            });
            console.log("Sorting recs by LMK key...")
            recommendations.data.sort((a,b) => {return a.LMK_KEY == b.LMK_KEY ? 0 : (a.LMK_KEY < b.LMK_KEY ? -1 : 1)});
            displayDatapointsOnMap();
        }
      });
      await zipReader.close();
    } catch (error) {
      console.error(error.message);
    }
  }

  function generateOnClickFunctionForCert(cert){
      return ()=>{
        mostRecentlySelectedCert = cert;
        loadStatsIntoPanel(cert, false);
        map.flyTo(cert.marker.latlng, 18);
      }
  }

  function makeCircleMarker(cert){
    return L.circleMarker(cert.latLong, {
      radius : 5,
      fillColor: '#0000ff',                
      fillOpacity: 0.9,
      opacity: 0,
      interactive:true
    }).on("click",generateOnClickFunctionForCert(cert)).addTo(map);
  }

  function displayDatapointsOnMap(){ //ONLY to be used the first time
    let UPRNkeys = Object.keys(UPRNLookup);
    let certsLength = certificates.data.length;

        certificates.data.forEach((cert,index) => {
            if (!UPRNkeys.includes(cert.UPRN)){
                return;
            }

            if (index < certificates.data.length - 1 && certificates.data[index+1].UPRN == cert.UPRN && Date.parse(certificates.data[index+1].LODGEMENT_DATETIME) > Date.parse(cert.LODGEMENT_DATETIME)){
              return; //then we don't process this datapoint, because the one after it in the list is for the same building but more recent
            }
            
            if (index == parseInt(Math.floor(certsLength / 4))){
                console.log("25% complete")
            } else if (index == parseInt(Math.floor(certsLength / 2))){
                console.log("50% complete. We won't bother listing 75...")
            }
            cert.canPotentiallyExistOnMap = true;
            cert.latLong = UPRNLookup[cert.UPRN];            
            cert.marker = makeCircleMarker(cert);
            cert.recs = binarySearchByLMKAndReturnAllValidNeighbouringResults(recommendations.data, cert.LMK_KEY);
            if (cert.recs != null){
              cert.recs.forEach(rec => {
                cert["HAS_PAYBACK_"+rec.PAYBACK_TYPE.toUpperCase()] = true;
                epcRecCategories.forEach(category => {
                  let codeLetter = rec.RECOMMENDATION_CODE[4];
                  if (codeLetter == undefined){
                    switch (rec.RECOMMENDATION_CODE){
                      case "USER":
                        if (!rec.RECOMMENDATION.includes("Insert Recommendation here")){
                          cert["REC_U"] = true;
                        }                        
                        break;
                      default:
                        alert("! unhandled epc code "+rec.RECOMMENDATION_CODE)
                      break;
                    }
                  } else if (codeLetter == category.internalName[4]){
                    cert[category.internalName] = true;
                  }   
                });
              });
            }
        });
        console.log("Done");
      recommendations.data = null;
      recommendations = null;
  }

  function rerenderDatapoints(){
    certificates.data.forEach((cert,index) => {
      if (cert.canPotentiallyExistOnMap == null){
        return;
      }

      //check if the datapoint is eligible for being shown right now, based on the filters that the user has checked:

      let shouldShowBasedOnEPC = false;
      let shouldShowBasedOnPaybackTime = false;

      epcRecCategories.forEach(category => {
        if (category.show && cert[category.internalName] != null && cert[category.internalName]){
          shouldShowBasedOnEPC = true;
        }                
      });

      if (cert.HAS_PAYBACK_SHORT && shortPaybackCheckbox.checked){ //technically these aren't exclusive - a cert can have both a short payback and a long payback - but it doesn't matter which one or how many, as long as the viewer has selected filters that encompass at least one of them. So this exclusionary-looking elseif is actually fine.
        shouldShowBasedOnPaybackTime = true;
      } else if (cert.HAS_PAYBACK_MEDIUM && mediumPaybackCheckbox.checked){
        shouldShowBasedOnPaybackTime = true;
      } else if (cert.HAS_PAYBACK_LONG && longPaybackCheckbox.checked){
        shouldShowBasedOnPaybackTime = true;
      } else if (cert.HAS_PAYBACK_OTHER && otherPaybackCheckbox.checked){
        shouldShowBasedOnPaybackTime = true;
      }
      
      if (shouldShowBasedOnEPC && shouldShowBasedOnPaybackTime){
        if (cert.marker == null){  //marker should be present, so create it if it doesn't exist
          cert.marker = makeCircleMarker(cert).addTo(map);
        }        
      } else if (cert.marker != null) { //marker exists but should not be present, so get rid of it
        map.removeLayer(cert.marker);
        cert.marker = null;
      }
    });

    if (mostRecentlySelectedCert != null){
      loadStatsIntoPanel(mostRecentlySelectedCert, true);
    }
  }

  function binarySearchByLMKAndReturnAllValidNeighbouringResults(arr, lmk){
      let i = parseInt(Math.floor(arr.length / 2));
      let lowerBound = 0;
      let upperBound = arr.length;
      let found = false;

      while (upperBound - lowerBound > 1){
        //check if we succeeded:
        if (lmk == arr[i].LMK_KEY){
          found = true;
          break;
        } else if (upperBound < arr.length && arr[upperBound].LMK_KEY == lmk){
          i = upperBound;
          found = true;
          break;
        } else if (arr[lowerBound].LMK_KEY == lmk){
          i = lowerBound;
          found = true;
          break;
        }
        //otherwise, update the bounds:
        if (lmk < arr[i].LMK_KEY){
          upperBound = i;
        } else {
          lowerBound = i;
        }
        i = parseInt(Math.floor((upperBound + lowerBound) / 2));
      }

      if (found){
        let orig_i = i;
        let itemsToReturn = [arr[orig_i]];
        //then check on either side of i to see if there are neighbouring rows with the same LMK number (very possible, because a place can have multiple recommendations)
        i--;
        while (i >= 0 && arr[i].LMK_KEY == lmk){
          itemsToReturn.push(arr[i]);
          i--;
        }
        i = orig_i + 1;
        while (i < arr.length && arr[i].LMK_KEY == lmk){
          itemsToReturn.push(arr[i]);
          i++;
        }
        
        return itemsToReturn.sort((a,b)=>{
          let payback_a = paybackTypes[a.PAYBACK_TYPE]; //get this as a number so that we can compare easily
          let payback_b = paybackTypes[b.PAYBACK_TYPE]; //get this as a number so that we can compare easily
          return payback_a == payback_b ? (a.RECOMMENDATION_ITEM == b.RECOMMENDATION_ITEM ? 0 : a.RECOMMENDATION_ITEM < b.RECOMMENDATION_ITEM ? -1 : 1) : (payback_a < payback_b ? -1 : 1);
        });
      }

      console.log("Couldn't find LMK key in recommendations: "+lmk);
      return null;
  }
  
function createHTMLfromRecs(recs){

  let table = document.createElement("table");
  let thead = document.createElement("thead");
  thead.innerHTML = "<th>Recommendation</th><th style='padding:0em 0.5em;'>Payback time</th><th style='padding:0em 0.5em;'>CO2 impact</th>";
  table.appendChild(thead);

  let instanceCountOfPaybackTypes = {}

  recs.forEach(rec => {
      if (instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] == null){
        instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] = 1;
      } else {
        instanceCountOfPaybackTypes[rec.PAYBACK_TYPE]++;
      }
  });

  recs.forEach(rec => {
    let recCategoryIsHighlighted = getEPCRecCategoryByCode(rec.RECOMMENDATION_CODE).show && isFilterCheckboxCheckedForPaybackType(rec.PAYBACK_TYPE.toUpperCase());
    let tr = document.createElement("tr");
    let recText = rec.RECOMMENDATION;
    if (recText == "Insert Recommendation here"){
      recText += " [sic]"
    }
    tr.innerHTML = (recCategoryIsHighlighted?"<td style='background-color:#f7f7a1;'>":"<td>")+recText+"</td>";
    if (instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] != null){
      tr.innerHTML += "<td style='text-align:center;'; rowspan='"+instanceCountOfPaybackTypes[rec.PAYBACK_TYPE]+"'>"+rec.PAYBACK_TYPE.toUpperCase()+"</td>";
      instanceCountOfPaybackTypes[rec.PAYBACK_TYPE] = null;
    }
    tr.innerHTML += "<td style='text-align:center;'>"+rec.CO2_IMPACT+"</td>";
    table.appendChild(tr);
  })

  return table;
}

function loadStatsIntoPanel(cert, isRerender){
  console.log(cert);
  recsArea.innerHTML = "";
  let h4 = document.createElement("h4");
  h4.innerText ="For UPRN "+cert.UPRN;
  h4.style = "margin-bottom:0;"
  recsArea.appendChild(h4);
  let inspectionDate = document.createElement("h4");
  inspectionDate.style = "font-size:0.9em;"
  inspectionDate.innerText = "(Inspected "+cert.INSPECTION_DATE+")";
  recsArea.appendChild(inspectionDate);
  if (!isRerender){
    recsArea.scrollTop = 0;
  }
  if (cert.recs == null){
    let div = document.createElement("div");
    div.style = "color:black;";
    div.innerHTML = "Apparently, this datapoint didn't have any EPC recommendations.<br>(Either that, or there was an LMK key match failure)";
    recsArea.appendChild(div);
  } else {
    recsArea.appendChild(createHTMLfromRecs(cert.recs));
  }
}