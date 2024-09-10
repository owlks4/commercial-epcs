import { rerenderDatapoints } from "./mapDataRender.js";

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

let FactorSelectControl = L.Control.extend({ 
    _container: null,
    options: {position: 'topright', },

    onAdd: function (map) {
      var megaDiv = L.DomUtil.create('div');
      let div = document.createElement("div");
      div.className = "factorSelectControl";
      let title = document.createElement("div");
      title.innerHTML = "<strong>Datapoint colour</strong>";
      div.appendChild(title);

      mappableFactors.forEach((factor,index) => {
        factor.radioButton = document.createElement("input");
        factor.radioButton.type = "radio";        
        factor.radioButton.id = factor.internalName;
        factor.radioButton.setAttribute("name","mappableFactorsRadioButtons")
        factor.radioButton.disabled = true;
        if (index == 0){
          factor.radioButton.checked = true;
        }
        factor.radioButton.oninput = (e)=>{
            if (factor.internalName == "NONE"){
              this.closeAccordion();
            }
            else if (e.target.checked){
              this.openAccordion(factor);
            }
            rerenderDatapoints();
        }
        let label = document.createElement("label");
        label.innerText = factor.displayName;
        label.setAttribute("for",factor.radioButton.id);
        div.appendChild(factor.radioButton);
        div.appendChild(label);
        div.appendChild(document.createElement("br"));      
      });

      this.accordion = document.createElement("div");
      this.accordion.className = "factorSelectControl accordion";

      megaDiv.appendChild(div);
      megaDiv.appendChild(this.accordion);
      this._div = megaDiv;
      L.DomEvent.disableClickPropagation(this._div);
      return this._div;
    },

    openAccordion(factor){
      this.accordion.innerHTML = "";
      let legendTitle = document.createElement("span");
      legendTitle.innerHTML = "<strong>Legend</strong><br>"
      this.accordion.appendChild(legendTitle);

      Object.keys(factor.colScaleReference).forEach((key)=>{
        this.accordion.appendChild(makeLegendCheckbox(key, factor.colScaleReference[key], factor));
      });

      this.accordion.style = "max-height:fit-content;";
    },

    closeAccordion(){
      this.accordion.innerHTML = "";
      this.accordion.style = "";
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

let factorSelectControl = new FactorSelectControl();

function spawnMapControls(map){
    factorSelectControl.addTo(map);
}

export {spawnMapControls, mappableFactors}