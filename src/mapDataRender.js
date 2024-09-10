import { mappableFactors } from "./mapControls.js";
import {epcRecCategories, shouldRecBeHighlighted, shortPaybackCheckbox,mediumPaybackCheckbox,longPaybackCheckbox,otherPaybackCheckbox} from "./recFilterManager.js";

let map = null;
let loadStatsIntoPanel = null;
let certificates = null;
let mostRecentlySelectedCert = null;

function setCertificates(c){
    certificates = c;
}

function setMapRenderVars(_map, _loadStatsIntoPanel){
    map = _map;
    loadStatsIntoPanel = _loadStatsIntoPanel;
}

function rerenderDatapoints(){
    certificates.data.forEach((cert,index) => {
      if (cert.canPotentiallyExistOnMap == null){
        return;
      }

      let factorToMap = null;

      for (let i = 0; i < mappableFactors.length; i++){
        if (mappableFactors[i].radioButton.checked){
          factorToMap = mappableFactors[i];
        }
      }

      if (factorToMap.internalName == "NONE"){
        factorToMap = null;
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

      if (!(shouldShowBasedOnEPC && shouldShowBasedOnPaybackTime)){ //we should not present this marker at all
        if (cert.marker != null) { //marker exists but should not be present, so get rid of it
          map.removeLayer(cert.marker);
          cert.marker = null;
        }
        return;
      }

      //check the legend checkboxes (EPC rating etc)

      for (let i = 0; i < mappableFactors.length; i++){
        let factor = mappableFactors[i];

        if (factor.internalName != "NONE" && factor.radioButton != null && factor.radioButton.checked){
          if (!factor.checkedSubBoxes[cert[factor.internalName]]){ //then it fails the check
            if (cert.marker != null) { //remove its marker if it exists
              map.removeLayer(cert.marker);
              cert.marker = null;
            }
            return;
          }
          break;
        }
      }

      //if we reach this point, there's a chance that we should present this marker, but we haven't checked that the correct payback and the correct code occur in the same item yet, so we do that now:

      let isTrulyValid = false;

      cert.recs.forEach(rec => {
          if (shouldRecBeHighlighted(rec)){
            isTrulyValid = true;
          }
      });

      if (cert.marker != null){ //delete the old one to ensure that it gets its new colour if required, when it's recreated immediately afterwards
        map.removeLayer(cert.marker);
        cert.marker = null;
      }
      
      if (isTrulyValid){
        cert.marker = makeCircleMarker(cert, factorToMap).addTo(map);  
      }
    });

    if (mostRecentlySelectedCert != null){
      loadStatsIntoPanel(mostRecentlySelectedCert, true);
    }
  }

  function makeCircleMarker(cert, factorToMap){

    let fillCol = '#0000ff';
    let factorValue = null;

    if (factorToMap != null){
      factorValue = cert[factorToMap.internalName];
      fillCol = factorToMap.getColorForValue(factorValue);
    }

    let circleMarker = L.circleMarker(cert.latLong, {
      radius : 5,
      fillColor: fillCol,                
      fillOpacity: 0.9,
      color: "black",
      weight:1,
      opacity: factorToMap == null ? 0 : 0.9,
      interactive:true
    }).on("click",generateOnClickFunctionForCert(cert)).addTo(map);

    if (factorValue != null){
      if (factorToMap.categoricTooltipTexts != null){
        circleMarker.bindTooltip(factorToMap.categoricTooltipTexts[String(factorValue)])
      } else {
        circleMarker.bindTooltip(factorToMap.displayName +": "+String(factorValue))
      }     
    }

    return circleMarker;
  }

  function generateOnClickFunctionForCert(cert){
    return ()=>{
      mostRecentlySelectedCert = cert;
      loadStatsIntoPanel(cert, false);
      map.flyTo(cert.latLong, 18);
    }
}

  export {rerenderDatapoints,setMapRenderVars,certificates,setCertificates,makeCircleMarker}