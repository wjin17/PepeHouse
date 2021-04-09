import {
  BrowserRouter as Router,
  Switch,
  Route,
  Redirect,
} from "react-router-dom";
import "bulma/css/bulma.min.css";

import Home from "../../pages/home";
import Host from "../../pages/host";
import Room from "../../pages/room";
/* import Test from "../../pages/test";

<Route path="/test/:roomID">
          <Test />
        </Route>
        <Route path="/test">
          <Test />
        </Route> */

function App() {
  return (
    <Router>
      <Switch>
        <Route exact path="/host/:roomID">
          <Host />
        </Route>
        <Route exact path="/host">
          <Host />
        </Route>
        <Route exact path="/room/:roomID">
          <Room />
        </Route>
        <Route exact path="/room">
          <Redirect to="/" />
        </Route>
        <Route exact path="/">
          <Home />
        </Route>
      </Switch>
    </Router>
  );
}

export default App;

/* 
        <Route path="/room/:roomID">
          <Users />
        </Route> */
