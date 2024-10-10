import { rerenderDatapoints, getAsHTMLList, USE_MAP_FOR_RENDER } from "./mapDataRender.js";

class MappableFactor {
    constructor(displayName, internalName, colScaleReference){
      this.displayName = displayName;
      this.internalName = internalName;
      this.colScaleReference = colScaleReference;
      this.checkedSubBoxes = {};
      this.categoricTooltipTexts = null

      if (this.colScaleReference != null){
        this.categoricTooltipTexts = {};
        Object.keys(this.colScaleReference).forEach(categoricValue => {
          this.categoricTooltipTexts[categoricValue] = this.displayName+": "+categoricValue;
        });
      }
    }

    generateRadioButtonAndAddToThisDiv(div, isFirstInList, onActivate, onDeactivate, activateDeactivateParameter){
      if (this.radioButton != null){
        this.radioButton.parentElement.remove();
      }
      this.radioButton = document.createElement("input");
      this.radioButton.type = "radio";        
      this.radioButton.id = this.internalName;
      this.radioButton.setAttribute("name","mappableFactorsRadioButtons")
      this.radioButton.disabled = true;
      if (isFirstInList){
        this.radioButton.checked = true;
      }
      this.radioButton.oninput = (e)=>{
          if (this.internalName == "NONE"){
            onDeactivate(activateDeactivateParameter);
          }
          else if (e.target.checked){
            onActivate(activateDeactivateParameter, this);
          }
          rerenderDatapoints();
      }
      let label = document.createElement("label");
      label.innerText = this.displayName;
      label.setAttribute("for",this.radioButton.id);
      let radButtonParentDiv = document.createElement("div");
      radButtonParentDiv.appendChild(this.radioButton);
      radButtonParentDiv.appendChild(label);
      div.appendChild(radButtonParentDiv);
    }

    getColorForValue(value){
      if (typeof value == "string"){
        let col = this.colScaleReference[value];
        if (col == null){
          alert("Unhandled "+this.internalName+" value: "+value);
          return null;
        } else {
          return col;
        }
      } else {
        alert("Continuous legend elements not yet implemented");
      }
    }
}

let EPCbandColours = {
  "A+":"rgb(87,127,247)","A":"rgb(4,134,86)","B":"rgb(26,175,91)","C":"rgb(141,197,62)","D":"rgb(253,204,3)",
  "E":"rgb(249,172,100)", "F":"rgb(242,138,32)", "G":"rgb(237,28,57)", "INVALID!":"rgb(0,0,0)"
}

let fuels = {
  "Biogas":"#538f53",
  "Biomass":"#1f5e1f",
  "District Heating":"#910038",
  "Dual Fuel Appliances (Mineral + Wood)":"#b05510",
  "Grid Displaced Electricity":"#2c60db",
  "Grid Supplied Electricity":"#e0d612",
  "LPG":"#6e6760",
  "Natural Gas":"#9e9e9e",
  "Oil":"#1f1c1a",
  "Other":"#7a28b5",
  "Smokeless Fuel (inc Coke)":"#547987",
  "Waste Heat":"#a6178c",
}

let mappableFactors = [
  new MappableFactor("None (default to blue)","NONE",null),
  new MappableFactor("EPC band","ASSET_RATING_BAND",EPCbandColours),
  new MappableFactor("Main heating fuel","MAIN_HEATING_FUEL",fuels)
];

function composeAddress(cert){
  let addr = ""

  if (cert.ADDRESS1 != ""){
    addr += cert.ADDRESS1+" ";
  }
  if (cert.ADDRESS2 != ""){
    addr += cert.ADDRESS2+" ";
  }
  if (cert.ADDRESS3 != ""){
    addr += cert.ADDRESS3+" ";
  }
  if (cert.POSTCODE != ""){
    addr += cert.POSTCODE;
  }
  return addr.trim();
}

function openAccordion(factorSelectControl, factor){ //I haven't put this and its counterpart under FactorSelectControl itself because these functions get passed around as variables in the onAdd function of that class, and I wanted to make sure they were definitely available
  factorSelectControl.accordion.innerHTML = "";
  let legendTitle = document.createElement("span");
  legendTitle.innerHTML = "<strong>Legend</strong><br>"
  factorSelectControl.accordion.appendChild(legendTitle);

  Object.keys(factor.colScaleReference).forEach((key)=>{
    factorSelectControl.accordion.appendChild(makeLegendCheckbox(key, factor.colScaleReference[key], factor));
  });

  factorSelectControl.accordion.style = "max-height:fit-content;";
}

function closeAccordion(factorSelectControl){
  factorSelectControl.accordion.innerHTML = "";
  factorSelectControl.accordion.style = "";
}

let FactorSelectControl = L.Control.extend({ 
    _container: null,
    options: {position: 'topright', },

    onAdd: function (map) {
      var megaDiv = L.DomUtil.create('div');
      let div = document.createElement("div");
      div.className = "control-panel-white";
      let title = document.createElement("div");
      title.innerHTML = "<strong>Datapoint colour</strong>";
      div.appendChild(title);

      mappableFactors.forEach((factor,index) => {
        factor.generateRadioButtonAndAddToThisDiv(div, index == 0, openAccordion, closeAccordion, this);   
      });

      this.accordion = document.createElement("div");
      this.accordion.className = "control-panel-white accordion";

      megaDiv.appendChild(div);
      megaDiv.appendChild(this.accordion);
      this._div = megaDiv;
      L.DomEvent.disableClickPropagation(this._div);
      return this._div;
    }
});

function makeLegendCheckbox(labelText, color, factor){
    let div = document.createElement("div");
    div.style="display:flex;margin-bottom:0.15em;"
  
    factor.checkedSubBoxes[labelText] = true;
  
    let checkbox = document.createElement("span");
    checkbox.className = "legend-checkbox checked";
    checkbox.checked = true;
    checkbox.style = "background-color:"+color;
    checkbox.innerText = "✔";
    div.onclick = (e) => {
      if (checkbox.className.includes("checked")){
        checkbox.className = "legend-checkbox"; //then disable it
        checkbox.style = "";
        factor.checkedSubBoxes[labelText] = false;      
      } else {
        checkbox.className = "legend-checkbox checked"; //then enable it
        checkbox.style = "background-color:"+color;
        factor.checkedSubBoxes[labelText] = true;
      }
      rerenderDatapoints();
    };
    let labelDiv = document.createElement("div");
    labelDiv.innerText = labelText;
    labelDiv.style="user-select:none;width:fit-content;margin-left:0.35em";
    div.appendChild(checkbox);
    div.appendChild(labelDiv);
    return div;
}

let UngeolocatedResultsControl = L.Control.extend({ 
    _container: null,
    options: {position: 'bottomright', },

    onAdd: function (map) {
      var megaDiv = L.DomUtil.create('div');
      let div = document.createElement("div");
      div.className = "control-panel-white";
      div.style = "max-width:unset;"
      let title = document.createElement("div");
      title.style = "white-space:nowrap;"
      title.innerHTML = "<strong>Additional filter results that could not be geolocated:</strong>";
      div.appendChild(title);
      this.listParent = document.createElement("div");
      this.listParent.className = "control-panel-white";
      this.listParent.style="max-width:unset;padding-top:0.25em;padding-bottom:0.75em;"
      this.list = document.createElement("ul");
      this.list.id = "ungeolocated-results-list";
      this.listParent.appendChild(this.list);
      megaDiv.appendChild(div);
      megaDiv.appendChild(this.listParent);
      this._div = megaDiv;
      L.DomEvent.disableClickPropagation(this._div);
      L.DomEvent.disableScrollPropagation(this._div);
      return this._div;
    },

    update(ungeolocatedResults, factorToMap){
      this.list.remove();
      this.list = getAsHTMLList(ungeolocatedResults, factorToMap, 100)
      this.list.id = "ungeolocated-results-list";
      this.listParent.appendChild(this.list);
    }
});

let factorSelectControl = new FactorSelectControl();
let ungeolocatedResultsControl = new UngeolocatedResultsControl();

function populateListViewLegendCheckboxes(div, factor){
  div.innerHTML = "";
  let checkboxesArea = document.createElement("div");
  checkboxesArea.style = "display:flex;padding-top:0.5em;justify-content:start;width:100%;overflow:hidden auto;flex-wrap:wrap;max-height:7em;"
  Object.keys(factor.colScaleReference).forEach((key)=>{
    let chk = makeLegendCheckbox(key, factor.colScaleReference[key], factor);
    chk.style = "display:flex;margin-bottom:0.15em;margin-right:1em;"
    checkboxesArea.appendChild(chk);
  });
  div.appendChild(checkboxesArea);
}

function clearListViewLegendCheckboxes(div){
  div.innerHTML = "";
}

function spawnMapControls(map){
    if (USE_MAP_FOR_RENDER){
      factorSelectControl.addTo(map);
      ungeolocatedResultsControl.addTo(map);
    } else {
      let lvf = document.getElementById("list-view-filters");
      let legend = document.getElementById("list-view-filters-legend");
      mappableFactors.forEach((factor,index) => {        
        factor.generateRadioButtonAndAddToThisDiv(lvf, index == 0, populateListViewLegendCheckboxes, clearListViewLegendCheckboxes, legend);   
        factor.radioButton.disabled = false;
      });
    }
}

export {spawnMapControls, ungeolocatedResultsControl, mappableFactors, composeAddress}